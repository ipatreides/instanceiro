// src/lib/calendar-outlook.ts

const API = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export interface CalendarEventPayload {
  summary: string;
  description: string;
  start: string;
  end: string;
}

export async function createOutlookEvent(
  accessToken: string,
  payload: CalendarEventPayload
): Promise<{ eventId: string }> {
  const res = await fetch(`${API}/me/calendar/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: payload.summary,
      body: { contentType: "text", content: payload.description },
      start: { dateTime: payload.start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: payload.end, timeZone: "America/Sao_Paulo" },
    }),
  });

  if (!res.ok) throw new Error(`Outlook create failed: ${res.status}`);
  const data = await res.json();
  return { eventId: data.id };
}

export async function updateOutlookEvent(
  accessToken: string,
  eventId: string,
  payload: Partial<CalendarEventPayload>
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (payload.summary) body.subject = payload.summary;
  if (payload.description) body.body = { contentType: "text", content: payload.description };
  if (payload.start) body.start = { dateTime: payload.start, timeZone: "America/Sao_Paulo" };
  if (payload.end) body.end = { dateTime: payload.end, timeZone: "America/Sao_Paulo" };

  const res = await fetch(`${API}/me/calendar/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Outlook update failed: ${res.status}`);
  return true;
}

export async function deleteOutlookEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${API}/me/calendar/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return;
  if (!res.ok) throw new Error(`Outlook delete failed: ${res.status}`);
}

export async function refreshOutlookToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "Calendars.ReadWrite offline_access",
    }),
  });

  if (!res.ok) throw new Error(`Outlook refresh failed: ${res.status}`);
  return await res.json();
}
