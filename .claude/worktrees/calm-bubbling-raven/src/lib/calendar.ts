// src/lib/calendar.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, refreshGoogleToken,
  type CalendarEventPayload,
} from "@/lib/calendar-google";
import {
  createOutlookEvent, updateOutlookEvent, deleteOutlookEvent, refreshOutlookToken,
} from "@/lib/calendar-outlook";

export interface ScheduleEventData {
  instanceName: string;
  title?: string;
  scheduledAt: string;
  participants: string[];
  message?: string;
}

function buildPayload(data: ScheduleEventData): CalendarEventPayload {
  const summary = data.title
    ? `${data.title} — ${data.instanceName}`
    : `${data.instanceName} — Instanceiro`;

  const lines = [`Participantes: ${data.participants.join(", ")}`];
  if (data.message) lines.push(`Mensagem: ${data.message}`);
  lines.push("---", "Instanceiro — instanceiro.vercel.app");

  const start = data.scheduledAt;
  const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();

  return { summary, description: lines.join("\n"), start, end };
}

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: "google" | "outlook";
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
}

async function getValidToken(conn: ConnectionRow): Promise<string | null> {
  const admin = createAdminClient();

  try {
    let accessToken = await decrypt(conn.access_token);
    const refreshToken = await decrypt(conn.refresh_token);

    // Check if token is expired (with 5 min buffer)
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
    const isExpired = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
      try {
        const refreshFn = conn.provider === "google" ? refreshGoogleToken : refreshOutlookToken;
        const result = await refreshFn(refreshToken);

        accessToken = result.access_token;
        const newExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
        const encryptedAccess = await encrypt(accessToken);

        await admin.from("calendar_connections")
          .update({ access_token: encryptedAccess, token_expires_at: newExpiresAt, last_sync_error: null })
          .eq("id", conn.id);
      } catch {
        // Refresh failed — disable connection
        await admin.from("calendar_connections")
          .update({ enabled: false, last_sync_error: "Token expirado. Reconecte seu calendario." })
          .eq("id", conn.id);
        return null;
      }
    }

    return accessToken;
  } catch {
    return null;
  }
}

async function getEnabledConnections(userId: string): Promise<ConnectionRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendar_connections")
    .select("id, user_id, provider, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (data ?? []) as ConnectionRow[];
}

export async function createCalendarEvent(
  userId: string,
  scheduleId: string,
  data: ScheduleEventData
): Promise<void> {
  const connections = await getEnabledConnections(userId);
  const payload = buildPayload(data);
  const admin = createAdminClient();

  for (const conn of connections) {
    try {
      const token = await getValidToken(conn);
      if (!token) continue;

      const createFn = conn.provider === "google" ? createGoogleEvent : createOutlookEvent;
      const { eventId } = await createFn(token, payload);

      await admin.from("schedule_calendar_events").upsert({
        schedule_id: scheduleId,
        user_id: userId,
        provider: conn.provider,
        external_event_id: eventId,
      }, { onConflict: "schedule_id,user_id,provider" });

      await admin.from("calendar_connections")
        .update({ last_sync_error: null })
        .eq("id", conn.id);
    } catch (e) {
      await admin.from("calendar_connections")
        .update({ last_sync_error: String(e) })
        .eq("id", conn.id);
    }
  }
}

export async function updateCalendarEvent(
  userId: string,
  scheduleId: string,
  data: Partial<ScheduleEventData>
): Promise<void> {
  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("schedule_calendar_events")
    .select("provider, external_event_id")
    .eq("schedule_id", scheduleId)
    .eq("user_id", userId);

  if (!mappings?.length) return;

  const connections = await getEnabledConnections(userId);
  const payload = data.scheduledAt ? buildPayload(data as ScheduleEventData) : undefined;

  for (const mapping of mappings) {
    const conn = connections.find((c) => c.provider === mapping.provider);
    if (!conn) continue;

    try {
      const token = await getValidToken(conn);
      if (!token) continue;

      const updateFn = conn.provider === "google" ? updateGoogleEvent : updateOutlookEvent;
      const updated = await updateFn(token, mapping.external_event_id, payload ?? {});

      if (!updated && data.scheduledAt) {
        // Event was deleted externally, recreate
        const createFn = conn.provider === "google" ? createGoogleEvent : createOutlookEvent;
        const { eventId } = await createFn(token, buildPayload(data as ScheduleEventData));

        await admin.from("schedule_calendar_events")
          .update({ external_event_id: eventId })
          .eq("schedule_id", scheduleId)
          .eq("user_id", userId)
          .eq("provider", conn.provider);
      }

      await admin.from("calendar_connections")
        .update({ last_sync_error: null })
        .eq("id", conn.id);
    } catch (e) {
      await admin.from("calendar_connections")
        .update({ last_sync_error: String(e) })
        .eq("id", conn.id);
    }
  }
}

export async function deleteCalendarEvent(
  userId: string,
  scheduleId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("schedule_calendar_events")
    .select("id, provider, external_event_id")
    .eq("schedule_id", scheduleId)
    .eq("user_id", userId);

  if (!mappings?.length) return;

  const connections = await getEnabledConnections(userId);

  for (const mapping of mappings) {
    const conn = connections.find((c) => c.provider === mapping.provider);
    if (!conn) continue;

    try {
      const token = await getValidToken(conn);
      if (!token) continue;

      const deleteFn = conn.provider === "google" ? deleteGoogleEvent : deleteOutlookEvent;
      await deleteFn(token, mapping.external_event_id);
    } catch {
      // Ignore delete errors
    }

    await admin.from("schedule_calendar_events").delete().eq("id", mapping.id);
  }
}

export async function syncAllParticipants(
  scheduleId: string,
  action: "update" | "delete",
  data?: Partial<ScheduleEventData>
): Promise<void> {
  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("schedule_calendar_events")
    .select("user_id")
    .eq("schedule_id", scheduleId);

  if (!mappings?.length) return;

  const uniqueUserIds = [...new Set(mappings.map((m) => m.user_id))];

  await Promise.allSettled(
    uniqueUserIds.map((userId) =>
      action === "delete"
        ? deleteCalendarEvent(userId, scheduleId)
        : updateCalendarEvent(userId, scheduleId, data ?? {})
    )
  );
}
