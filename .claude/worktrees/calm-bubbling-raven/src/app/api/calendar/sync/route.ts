// src/app/api/calendar/sync/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  syncAllParticipants,
  type ScheduleEventData,
} from "@/lib/calendar";

interface SyncRequest {
  action: "create" | "update" | "delete" | "delete_all";
  scheduleId: string;
  userId?: string;
  data?: ScheduleEventData;
}

export async function POST(request: Request) {
  // Verify caller is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SyncRequest;
  const { action, scheduleId, userId, data } = body;

  if (!scheduleId || !action) {
    return NextResponse.json({ error: "Missing scheduleId or action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "create": {
        if (!data || !userId) {
          return NextResponse.json({ error: "Missing data or userId for create" }, { status: 400 });
        }
        await createCalendarEvent(userId, scheduleId, data);
        break;
      }
      case "update": {
        if (userId) {
          await updateCalendarEvent(userId, scheduleId, data ?? {});
        } else {
          await syncAllParticipants(scheduleId, "update", data);
        }
        break;
      }
      case "delete": {
        if (!userId) {
          return NextResponse.json({ error: "Missing userId for delete" }, { status: 400 });
        }
        await deleteCalendarEvent(userId, scheduleId);
        break;
      }
      case "delete_all": {
        await syncAllParticipants(scheduleId, "delete");
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Calendar sync error:", e);
    return NextResponse.json({ ok: true }); // Best-effort: never return error to client
  }
}
