// src/lib/calendar-google.ts

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface CalendarEventPayload {
  summary: string;
  description: string;
  start: string; // ISO
  end: string;   // ISO
}

export async function createGoogleEvent(
  accessToken: string,
  payload: CalendarEventPayload
): Promise<{ eventId: string }> {
  const res = await fetch(`${API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: payload.summary,
      description: payload.description,
      start: { dateTime: payload.start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: payload.end, timeZone: "America/Sao_Paulo" },
    }),
  });

  if (!res.ok) throw new Error(`Google create failed: ${res.status}`);
  const data = await res.json();
  return { eventId: data.id };
}

export async function updateGoogleEvent(
  accessToken: string,
  eventId: string,
  payload: Partial<CalendarEventPayload>
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (payload.summary) body.summary = payload.summary;
  if (payload.description) body.description = payload.description;
  if (payload.start) body.start = { dateTime: payload.start, timeZone: "America/Sao_Paulo" };
  if (payload.end) body.end = { dateTime: payload.end, timeZone: "America/Sao_Paulo" };

  const res = await fetch(`${API}/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) return false; // Event deleted externally
  if (!res.ok) throw new Error(`Google update failed: ${res.status}`);
  return true;
}

export async function deleteGoogleEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${API}/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return; // Already deleted
  if (!res.ok) throw new Error(`Google delete failed: ${res.status}`);
}

export async function refreshGoogleToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Google refresh failed: ${res.status}`);
  return await res.json();
}
