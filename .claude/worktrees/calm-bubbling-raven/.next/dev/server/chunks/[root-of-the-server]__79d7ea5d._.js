module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/server.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/@supabase/ssr/dist/module/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/headers.js [app-route] (ecmascript)");
;
;
async function createClient() {
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createServerClient"])(("TURBOPACK compile-time value", "https://swgnctajsbiyhqxstrnx.supabase.co"), ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3Z25jdGFqc2JpeWhxeHN0cm54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTMxNDgsImV4cCI6MjA4OTA4OTE0OH0.amN_Z7WplnP2SZg7TIoTQfJqGuZis3oJR3DSyPmsnRA"), {
        cookies: {
            getAll () {
                return cookieStore.getAll();
            },
            setAll (cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options })=>cookieStore.set(name, value, options));
                } catch  {}
            }
        }
    });
}
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/admin.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createAdminClient",
    ()=>createAdminClient
]);
// src/lib/supabase/admin.ts
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/@supabase/supabase-js/dist/index.mjs [app-route] (ecmascript) <locals>");
;
function createAdminClient() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://swgnctajsbiyhqxstrnx.supabase.co"), process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false
        }
    });
}
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/crypto.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "decrypt",
    ()=>decrypt,
    "encrypt",
    ()=>encrypt
]);
// src/lib/crypto.ts
const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 128; // bits
function getKey() {
    const hex = process.env.CALENDAR_ENCRYPTION_KEY;
    if (!hex) throw new Error("CALENDAR_ENCRYPTION_KEY not set");
    const bytes = new Uint8Array(hex.length / 2);
    for(let i = 0; i < hex.length; i += 2){
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
function toBase64(bytes) {
    let binary = "";
    for (const b of bytes)binary += String.fromCharCode(b);
    return btoa(binary);
}
function fromBase64(str) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++)bytes[i] = binary.charCodeAt(i);
    return bytes;
}
async function encrypt(plaintext) {
    const key = getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const data = new TextEncoder().encode(plaintext);
    const cryptoKey = await crypto.subtle.importKey("raw", key.buffer, {
        name: ALGORITHM
    }, false, [
        "encrypt"
    ]);
    const encrypted = await crypto.subtle.encrypt({
        name: ALGORITHM,
        iv,
        tagLength: TAG_LENGTH
    }, cryptoKey, data);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return toBase64(combined);
}
async function decrypt(encoded) {
    const key = getKey();
    const combined = fromBase64(encoded);
    const iv = combined.subarray(0, IV_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH);
    const cryptoKey = await crypto.subtle.importKey("raw", key.buffer, {
        name: ALGORITHM
    }, false, [
        "decrypt"
    ]);
    const decrypted = await crypto.subtle.decrypt({
        name: ALGORITHM,
        iv: iv.buffer,
        tagLength: TAG_LENGTH
    }, cryptoKey, ciphertext.buffer);
    return new TextDecoder().decode(decrypted);
}
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/calendar-google.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createGoogleEvent",
    ()=>createGoogleEvent,
    "deleteGoogleEvent",
    ()=>deleteGoogleEvent,
    "refreshGoogleToken",
    ()=>refreshGoogleToken,
    "updateGoogleEvent",
    ()=>updateGoogleEvent
]);
// src/lib/calendar-google.ts
const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
async function createGoogleEvent(accessToken, payload) {
    const res = await fetch(`${API}/calendars/primary/events`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            summary: payload.summary,
            description: payload.description,
            start: {
                dateTime: payload.start,
                timeZone: "America/Sao_Paulo"
            },
            end: {
                dateTime: payload.end,
                timeZone: "America/Sao_Paulo"
            }
        })
    });
    if (!res.ok) throw new Error(`Google create failed: ${res.status}`);
    const data = await res.json();
    return {
        eventId: data.id
    };
}
async function updateGoogleEvent(accessToken, eventId, payload) {
    const body = {};
    if (payload.summary) body.summary = payload.summary;
    if (payload.description) body.description = payload.description;
    if (payload.start) body.start = {
        dateTime: payload.start,
        timeZone: "America/Sao_Paulo"
    };
    if (payload.end) body.end = {
        dateTime: payload.end,
        timeZone: "America/Sao_Paulo"
    };
    const res = await fetch(`${API}/calendars/primary/events/${eventId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (res.status === 404) return false; // Event deleted externally
    if (!res.ok) throw new Error(`Google update failed: ${res.status}`);
    return true;
}
async function deleteGoogleEvent(accessToken, eventId) {
    const res = await fetch(`${API}/calendars/primary/events/${eventId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    if (res.status === 404) return; // Already deleted
    if (!res.ok) throw new Error(`Google delete failed: ${res.status}`);
}
async function refreshGoogleToken(refreshToken) {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken
        })
    });
    if (!res.ok) throw new Error(`Google refresh failed: ${res.status}`);
    return await res.json();
}
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/calendar-outlook.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createOutlookEvent",
    ()=>createOutlookEvent,
    "deleteOutlookEvent",
    ()=>deleteOutlookEvent,
    "refreshOutlookToken",
    ()=>refreshOutlookToken,
    "updateOutlookEvent",
    ()=>updateOutlookEvent
]);
// src/lib/calendar-outlook.ts
const API = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
async function createOutlookEvent(accessToken, payload) {
    const res = await fetch(`${API}/me/calendar/events`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            subject: payload.summary,
            body: {
                contentType: "text",
                content: payload.description
            },
            start: {
                dateTime: payload.start,
                timeZone: "America/Sao_Paulo"
            },
            end: {
                dateTime: payload.end,
                timeZone: "America/Sao_Paulo"
            }
        })
    });
    if (!res.ok) throw new Error(`Outlook create failed: ${res.status}`);
    const data = await res.json();
    return {
        eventId: data.id
    };
}
async function updateOutlookEvent(accessToken, eventId, payload) {
    const body = {};
    if (payload.summary) body.subject = payload.summary;
    if (payload.description) body.body = {
        contentType: "text",
        content: payload.description
    };
    if (payload.start) body.start = {
        dateTime: payload.start,
        timeZone: "America/Sao_Paulo"
    };
    if (payload.end) body.end = {
        dateTime: payload.end,
        timeZone: "America/Sao_Paulo"
    };
    const res = await fetch(`${API}/me/calendar/events/${eventId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`Outlook update failed: ${res.status}`);
    return true;
}
async function deleteOutlookEvent(accessToken, eventId) {
    const res = await fetch(`${API}/me/calendar/events/${eventId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`Outlook delete failed: ${res.status}`);
}
async function refreshOutlookToken(refreshToken) {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            client_id: process.env.OUTLOOK_CLIENT_ID,
            client_secret: process.env.OUTLOOK_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope: "Calendars.ReadWrite offline_access"
        })
    });
    if (!res.ok) throw new Error(`Outlook refresh failed: ${res.status}`);
    return await res.json();
}
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/calendar.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createCalendarEvent",
    ()=>createCalendarEvent,
    "deleteCalendarEvent",
    ()=>deleteCalendarEvent,
    "syncAllParticipants",
    ()=>syncAllParticipants,
    "updateCalendarEvent",
    ()=>updateCalendarEvent
]);
// src/lib/calendar.ts
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/crypto.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$google$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/calendar-google.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$outlook$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/calendar-outlook.ts [app-route] (ecmascript)");
;
;
;
;
function buildPayload(data) {
    const summary = data.title ? `${data.title} — ${data.instanceName}` : `${data.instanceName} — Instanceiro`;
    const lines = [
        `Participantes: ${data.participants.join(", ")}`
    ];
    if (data.message) lines.push(`Mensagem: ${data.message}`);
    lines.push("---", "Instanceiro — instanceiro.vercel.app");
    const start = data.scheduledAt;
    const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
    return {
        summary,
        description: lines.join("\n"),
        start,
        end
    };
}
async function getValidToken(conn) {
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    try {
        let accessToken = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["decrypt"])(conn.access_token);
        const refreshToken = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["decrypt"])(conn.refresh_token);
        // Check if token is expired (with 5 min buffer)
        const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
        const isExpired = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;
        if (isExpired) {
            try {
                const refreshFn = conn.provider === "google" ? __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$google$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["refreshGoogleToken"] : __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$outlook$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["refreshOutlookToken"];
                const result = await refreshFn(refreshToken);
                accessToken = result.access_token;
                const newExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
                const encryptedAccess = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["encrypt"])(accessToken);
                await admin.from("calendar_connections").update({
                    access_token: encryptedAccess,
                    token_expires_at: newExpiresAt,
                    last_sync_error: null
                }).eq("id", conn.id);
            } catch  {
                // Refresh failed — disable connection
                await admin.from("calendar_connections").update({
                    enabled: false,
                    last_sync_error: "Token expirado. Reconecte seu calendario."
                }).eq("id", conn.id);
                return null;
            }
        }
        return accessToken;
    } catch  {
        return null;
    }
}
async function getEnabledConnections(userId) {
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data } = await admin.from("calendar_connections").select("id, user_id, provider, access_token, refresh_token, token_expires_at").eq("user_id", userId).eq("enabled", true);
    return data ?? [];
}
async function createCalendarEvent(userId, scheduleId, data) {
    const connections = await getEnabledConnections(userId);
    const payload = buildPayload(data);
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    for (const conn of connections){
        try {
            const token = await getValidToken(conn);
            if (!token) continue;
            const createFn = conn.provider === "google" ? __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$google$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createGoogleEvent"] : __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$outlook$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createOutlookEvent"];
            const { eventId } = await createFn(token, payload);
            await admin.from("schedule_calendar_events").upsert({
                schedule_id: scheduleId,
                user_id: userId,
                provider: conn.provider,
                external_event_id: eventId
            }, {
                onConflict: "schedule_id,user_id,provider"
            });
            await admin.from("calendar_connections").update({
                last_sync_error: null
            }).eq("id", conn.id);
        } catch (e) {
            await admin.from("calendar_connections").update({
                last_sync_error: String(e)
            }).eq("id", conn.id);
        }
    }
}
async function updateCalendarEvent(userId, scheduleId, data) {
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: mappings } = await admin.from("schedule_calendar_events").select("provider, external_event_id").eq("schedule_id", scheduleId).eq("user_id", userId);
    if (!mappings?.length) return;
    const connections = await getEnabledConnections(userId);
    const payload = data.scheduledAt ? buildPayload(data) : undefined;
    for (const mapping of mappings){
        const conn = connections.find((c)=>c.provider === mapping.provider);
        if (!conn) continue;
        try {
            const token = await getValidToken(conn);
            if (!token) continue;
            const updateFn = conn.provider === "google" ? __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$google$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["updateGoogleEvent"] : __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$outlook$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["updateOutlookEvent"];
            const updated = await updateFn(token, mapping.external_event_id, payload ?? {});
            if (!updated && data.scheduledAt) {
                // Event was deleted externally, recreate
                const createFn = conn.provider === "google" ? __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$google$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createGoogleEvent"] : __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$outlook$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createOutlookEvent"];
                const { eventId } = await createFn(token, buildPayload(data));
                await admin.from("schedule_calendar_events").update({
                    external_event_id: eventId
                }).eq("schedule_id", scheduleId).eq("user_id", userId).eq("provider", conn.provider);
            }
            await admin.from("calendar_connections").update({
                last_sync_error: null
            }).eq("id", conn.id);
        } catch (e) {
            await admin.from("calendar_connections").update({
                last_sync_error: String(e)
            }).eq("id", conn.id);
        }
    }
}
async function deleteCalendarEvent(userId, scheduleId) {
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: mappings } = await admin.from("schedule_calendar_events").select("id, provider, external_event_id").eq("schedule_id", scheduleId).eq("user_id", userId);
    if (!mappings?.length) return;
    const connections = await getEnabledConnections(userId);
    for (const mapping of mappings){
        const conn = connections.find((c)=>c.provider === mapping.provider);
        if (!conn) continue;
        try {
            const token = await getValidToken(conn);
            if (!token) continue;
            const deleteFn = conn.provider === "google" ? __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$google$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["deleteGoogleEvent"] : __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2d$outlook$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["deleteOutlookEvent"];
            await deleteFn(token, mapping.external_event_id);
        } catch  {
        // Ignore delete errors
        }
        await admin.from("schedule_calendar_events").delete().eq("id", mapping.id);
    }
}
async function syncAllParticipants(scheduleId, action, data) {
    const admin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const { data: mappings } = await admin.from("schedule_calendar_events").select("user_id").eq("schedule_id", scheduleId);
    if (!mappings?.length) return;
    const uniqueUserIds = [
        ...new Set(mappings.map((m)=>m.user_id))
    ];
    await Promise.allSettled(uniqueUserIds.map((userId)=>action === "delete" ? deleteCalendarEvent(userId, scheduleId) : updateCalendarEvent(userId, scheduleId, data ?? {})));
}
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/api/calendar/sync/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
// src/app/api/calendar/sync/route.ts
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/server.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/calendar.ts [app-route] (ecmascript)");
;
;
;
async function POST(request) {
    // Verify caller is authenticated
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createClient"])();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unauthorized"
        }, {
            status: 401
        });
    }
    const body = await request.json();
    const { action, scheduleId, userId, data } = body;
    if (!scheduleId || !action) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Missing scheduleId or action"
        }, {
            status: 400
        });
    }
    try {
        switch(action){
            case "create":
                {
                    if (!data || !userId) {
                        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                            error: "Missing data or userId for create"
                        }, {
                            status: 400
                        });
                    }
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createCalendarEvent"])(userId, scheduleId, data);
                    break;
                }
            case "update":
                {
                    if (userId) {
                        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["updateCalendarEvent"])(userId, scheduleId, data ?? {});
                    } else {
                        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["syncAllParticipants"])(scheduleId, "update", data);
                    }
                    break;
                }
            case "delete":
                {
                    if (!userId) {
                        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                            error: "Missing userId for delete"
                        }, {
                            status: 400
                        });
                    }
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["deleteCalendarEvent"])(userId, scheduleId);
                    break;
                }
            case "delete_all":
                {
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["syncAllParticipants"])(scheduleId, "delete");
                    break;
                }
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true
        });
    } catch (e) {
        console.error("Calendar sync error:", e);
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true
        }); // Best-effort: never return error to client
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__79d7ea5d._.js.map