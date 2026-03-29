// supabase/functions/discord-notify/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";

interface InstanceRow {
  id: number;
  name: string;
  cooldown_hours: number;
}

function calculateHourlyCooldownExpiry(completedAt: Date, cooldownHours: number): Date {
  return new Date(completedAt.getTime() + cooldownHours * 60 * 60 * 1000);
}

async function sendDiscordDM(
  botToken: string,
  discordUserId: string,
  content: string
): Promise<{ ok: boolean; code?: number }> {
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    return { ok: false, code: channelRes.status };
  }

  const channel = await channelRes.json();

  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!msgRes.ok) {
    const err = await msgRes.json().catch(() => ({}));
    return { ok: false, code: err.code ?? msgRes.status };
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  // Auth: accept service_role key or anon key from pg_cron's net.http_post
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = authHeader.replace("Bearer ", "");

  // Allow service role key or the function's own service key
  if (!serviceKey || (token !== serviceKey && !authHeader)) {
    return new Response(JSON.stringify({ error: "Unauthorized", hint: "service_key_missing: " + (serviceKey ? "present" : "absent") }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN")!;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  let sent = 0;
  let errors = 0;

  // Fetch hourly instances from database (dynamic, not hardcoded)
  const { data: hourlyInstances } = await supabase
    .from("instances")
    .select("id, name, cooldown_hours")
    .eq("cooldown_type", "hourly");

  if (!hourlyInstances?.length) {
    return Response.json({ sent: 0, errors: 0, message: "no hourly instances" });
  }

  const instanceIds = hourlyInstances.map((i: InstanceRow) => i.id);
  const instanceMap = new Map(hourlyInstances.map((i: InstanceRow) => [i.id, i]));

  // Fetch notification users (either hourly or schedule enabled)
  const { data: allNotifUsers } = await supabase
    .from("discord_notifications")
    .select("user_id, discord_user_id, hourly_enabled, schedule_enabled")
    .or("hourly_enabled.eq.true,schedule_enabled.eq.true");

  const hourlyUsers = (allNotifUsers ?? []).filter((u) => u.hourly_enabled);
  const scheduleUsers = (allNotifUsers ?? []).filter((u) => u.schedule_enabled);

  if (!hourlyUsers.length && !scheduleUsers.length) {
    return Response.json({ sent: 0, errors: 0, message: "no enabled users" });
  }

  // Use hourlyUsers for the hourly instance section below
  const users = hourlyUsers;

  for (const user of users) {
    try {
      // Fetch active characters
      const { data: characters } = await supabase
        .from("characters")
        .select("id, name")
        .eq("user_id", user.user_id)
        .eq("is_active", true);

      if (!characters?.length) continue;

      const charIds = characters.map((c: { id: string }) => c.id);

      // Fetch completions + notification log in parallel
      const [completionsRes, logRes] = await Promise.all([
        supabase
          .from("instance_completions")
          .select("character_id, instance_id, completed_at")
          .in("character_id", charIds)
          .in("instance_id", instanceIds)
          .order("completed_at", { ascending: false }),
        supabase
          .from("notification_log")
          .select("character_id, instance_id, type, notified_at")
          .eq("user_id", user.user_id)
          .in("instance_id", instanceIds),
      ]);

      const completions = completionsRes.data ?? [];
      const logEntries = logRes.data ?? [];

      if (!completions.length) continue;

      // Build lookup: latest completion per (char, instance)
      const latestCompletion = new Map<string, string>();
      for (const c of completions) {
        const key = `${c.character_id}:${c.instance_id}`;
        if (!latestCompletion.has(key)) {
          latestCompletion.set(key, c.completed_at);
        }
      }

      // Build lookup: latest notification per (char, instance, type)
      const latestNotificationByType = new Map<string, string>();
      for (const l of logEntries) {
        const keyWarning = `${l.character_id}:${l.instance_id}:${l.type}`;
        const existing = latestNotificationByType.get(keyWarning);
        if (!existing || l.notified_at > existing) {
          latestNotificationByType.set(keyWarning, l.notified_at);
        }
      }

      // Find warnings (<=5min to available) and newly available instances
      const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
      const warnings: { instanceId: number; characterId: string; characterName: string; minutesLeft: number }[] = [];
      const available: { instanceId: number; characterId: string; characterName: string }[] = [];

      for (const char of characters) {
        for (const instanceId of instanceIds) {
          const key = `${char.id}:${instanceId}`;
          const completedAt = latestCompletion.get(key);
          if (!completedAt) continue; // Never completed, skip

          const instance = instanceMap.get(instanceId);
          if (!instance?.cooldown_hours) continue;

          const expiry = calculateHourlyCooldownExpiry(new Date(completedAt), instance.cooldown_hours);
          const timeLeft = expiry.getTime() - now.getTime();

          if (timeLeft > 0 && timeLeft <= WARNING_THRESHOLD_MS) {
            // Warning: <=5 min until available
            const lastNotified = latestNotificationByType.get(`${key}:warning`);
            if (!lastNotified || lastNotified < completedAt) {
              warnings.push({
                instanceId,
                characterId: char.id,
                characterName: char.name,
                minutesLeft: Math.ceil(timeLeft / 60000),
              });
            }
          } else if (timeLeft <= 0) {
            // Available now
            const lastNotified = latestNotificationByType.get(`${key}:available`);
            if (!lastNotified || lastNotified < completedAt) {
              available.push({ instanceId, characterId: char.id, characterName: char.name });
            }
          }
        }
      }

      // Send warning DM
      if (warnings.length > 0) {
        const grouped = new Map<number, { chars: string[]; minutes: number }>();
        for (const w of warnings) {
          const entry = grouped.get(w.instanceId) ?? { chars: [], minutes: w.minutesLeft };
          entry.chars.push(w.characterName);
          grouped.set(w.instanceId, entry);
        }

        let msg = "Em breve:\n";
        for (const [instanceId, { chars, minutes }] of grouped) {
          const name = instanceMap.get(instanceId)?.name ?? `#${instanceId}`;
          msg += `• ${name} — ${chars.join(", ")} (em ~${minutes}min)\n`;
        }

        const result = await sendDiscordDM(botToken, user.discord_user_id, msg.trim());
        if (result.ok) {
          sent++;
          await supabase.from("notification_log").insert(
            warnings.map((w) => ({
              user_id: user.user_id,
              character_id: w.characterId,
              instance_id: w.instanceId,
              type: "warning",
            }))
          );
        } else if (result.code === 403 || result.code === 50007) {
          await supabase.from("discord_notifications")
            .update({ enabled: false }).eq("user_id", user.user_id);
          continue; // Skip available DM too
        } else {
          errors++;
        }
      }

      // Send available DM
      if (available.length > 0) {
        const grouped = new Map<number, string[]>();
        for (const a of available) {
          const list = grouped.get(a.instanceId) ?? [];
          list.push(a.characterName);
          grouped.set(a.instanceId, list);
        }

        let msg = "Instancias disponiveis:\n";
        for (const [instanceId, charNames] of grouped) {
          const name = instanceMap.get(instanceId)?.name ?? `#${instanceId}`;
          msg += `• ${name} — ${charNames.join(", ")}\n`;
        }

        const result = await sendDiscordDM(botToken, user.discord_user_id, msg.trim());
        if (result.ok) {
          sent++;
          await supabase.from("notification_log").insert(
            available.map((a) => ({
              user_id: user.user_id,
              character_id: a.characterId,
              instance_id: a.instanceId,
              type: "available",
            }))
          );
        } else if (result.code === 403 || result.code === 50007) {
          // Auto-disable on permanent failures
          await supabase
            .from("discord_notifications")
            .update({ enabled: false })
            .eq("user_id", user.user_id);
        } else {
          errors++;
        }
      }
    } catch (e) {
      errors++;
      console.error(`Error for user ${user.user_id}:`, e);
    }
  }

  // === SCHEDULE NOTIFICATIONS ===
  // Notify participants of upcoming schedules (5 min warning + start time)

  const WARNING_THRESHOLD_SCHEDULE = 5 * 60 * 1000;

  const { data: openSchedules } = await supabase
    .from("instance_schedules")
    .select("id, instance_id, character_id, created_by, scheduled_at, title, message, status")
    .eq("status", "open");

  if (openSchedules?.length) {
    // Get instance names
    const scheduleInstanceIds = [...new Set(openSchedules.map((s) => s.instance_id))];
    const { data: schedInstances } = await supabase
      .from("instances")
      .select("id, name")
      .in("id", scheduleInstanceIds);
    const schedInstanceMap = new Map((schedInstances ?? []).map((i) => [i.id, i.name]));

    for (const schedule of openSchedules) {
      const scheduledAt = new Date(schedule.scheduled_at);
      const timeUntil = scheduledAt.getTime() - now.getTime();

      // Only process schedules within the warning window or past due
      if (timeUntil > WARNING_THRESHOLD_SCHEDULE) continue;

      // Determine notification type
      let notifType: "warning" | "available" | null = null;
      let minutesLeft = 0;
      if (timeUntil > 0 && timeUntil <= WARNING_THRESHOLD_SCHEDULE) {
        notifType = "warning";
        minutesLeft = Math.ceil(timeUntil / 60000);
      } else if (timeUntil <= 0 && timeUntil > -10 * 60 * 1000) {
        // Only send "start" notification within 10 min after scheduled time
        notifType = "available";
      }

      if (!notifType) continue;

      // Get all participant user_ids (creator + joined)
      const { data: participants } = await supabase
        .from("schedule_participants")
        .select("user_id, character_id")
        .eq("schedule_id", schedule.id);

      const allUserIds = [
        schedule.created_by,
        ...(participants ?? []).map((p) => p.user_id),
      ];
      const uniqueUserIds = [...new Set(allUserIds)];

      // Get character names for the message
      const allCharIds = [
        schedule.character_id,
        ...(participants ?? []).map((p) => p.character_id),
      ];
      const { data: charData } = await supabase
        .from("characters")
        .select("id, name")
        .in("id", allCharIds);
      const charNames = (charData ?? []).map((c) => c.name);

      // Check which participants have schedule notifications enabled
      const notifUsers = scheduleUsers.filter((u) => uniqueUserIds.includes(u.user_id));

      if (!notifUsers?.length) continue;

      // Check dedup: has this schedule+type already been notified?
      const { data: existingLogs } = await supabase
        .from("notification_log")
        .select("user_id")
        .eq("schedule_id", schedule.id)
        .eq("type", notifType);

      const alreadyNotified = new Set((existingLogs ?? []).map((l) => l.user_id));

      const instanceName = schedInstanceMap.get(schedule.instance_id) ?? "Instancia";
      const title = schedule.title
        ? `${schedule.title} — ${instanceName}`
        : instanceName;

      for (const notifUser of notifUsers) {
        if (alreadyNotified.has(notifUser.user_id)) continue;

        try {
          let msg: string;
          if (notifType === "warning") {
            msg = `Agendamento em ~${minutesLeft}min:\n• ${title}\n• Participantes: ${charNames.join(", ")}`;
            if (schedule.message) msg += `\n• Mensagem: ${schedule.message}`;
          } else {
            msg = `Hora do agendamento!\n• ${title}\n• Participantes: ${charNames.join(", ")}`;
            if (schedule.message) msg += `\n• Mensagem: ${schedule.message}`;
          }

          const result = await sendDiscordDM(botToken, notifUser.discord_user_id, msg);
          if (result.ok) {
            sent++;
            await supabase.from("notification_log").insert({
              user_id: notifUser.user_id,
              character_id: schedule.character_id, // Use creator's char as reference
              instance_id: schedule.instance_id,
              schedule_id: schedule.id,
              type: notifType,
            });
          } else if (result.code === 403 || result.code === 50007) {
            await supabase.from("discord_notifications")
              .update({ enabled: false }).eq("user_id", notifUser.user_id);
          } else {
            errors++;
          }
        } catch (e) {
          errors++;
          console.error(`Schedule notify error for user ${notifUser.user_id}:`, e);
        }
      }
    }
  }

  return Response.json({ sent, errors, checked: users?.length ?? 0 });
});
