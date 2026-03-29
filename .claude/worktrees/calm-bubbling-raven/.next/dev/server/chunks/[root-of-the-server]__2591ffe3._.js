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
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/telemetry.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "hashToken",
    ()=>hashToken,
    "resolveTelemetryContext",
    ()=>resolveTelemetryContext
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
;
;
function hashToken(token) {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["createHash"])('sha256').update(token).digest('hex');
}
async function resolveTelemetryContext(request) {
    const token = request.headers.get('x-api-token');
    const accountId = request.headers.get('x-account-id') ?? '';
    const characterId = request.headers.get('x-character-id') ?? '';
    if (!token) {
        return {
            error: 'Missing required headers',
            status: 400
        };
    }
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    const tokenHash = hashToken(token);
    // Validate token
    const { data: tokenRow, error: tokenErr } = await supabase.from('telemetry_tokens').select('id, user_id').eq('token_hash', tokenHash).is('revoked_at', null).single();
    if (tokenErr || !tokenRow) {
        return {
            error: 'Invalid or revoked token',
            status: 401
        };
    }
    // Update last_used_at (fire and forget)
    supabase.from('telemetry_tokens').update({
        last_used_at: new Date().toISOString()
    }).eq('id', tokenRow.id).then(()=>{});
    // Find any of the user's characters that is in a group
    // The sniffer sends game-level IDs, but the DB uses UUIDs.
    // We resolve by user_id from the token — the user's group membership
    // determines context. If user has multiple characters in different groups,
    // we pick the first one (single group per character constraint).
    const { data: membership, error: memberErr } = await supabase.from('mvp_group_members').select('group_id, character_id, mvp_groups!inner(server_id)').eq('user_id', tokenRow.user_id).limit(1).single();
    if (memberErr || !membership) {
        return {
            error: 'Character not in a group',
            status: 404
        };
    }
    const groupId = membership.group_id;
    const characterUuid = membership.character_id;
    const serverId = membership.mvp_groups.server_id;
    // Upsert session — use character UUID as the session key
    const { data: session, error: sessionErr } = await supabase.from('telemetry_sessions').upsert({
        token_id: tokenRow.id,
        user_id: tokenRow.user_id,
        character_id: 0,
        account_id: 0,
        group_id: groupId,
        last_heartbeat: new Date().toISOString()
    }, {
        onConflict: 'token_id,character_id'
    }).select('id, config_version').single();
    if (sessionErr || !session) {
        return {
            error: 'Failed to create session',
            status: 500
        };
    }
    return {
        ctx: {
            userId: tokenRow.user_id,
            characterUuid,
            characterId,
            accountId,
            groupId,
            serverId,
            sessionId: session.id,
            tokenId: tokenRow.id
        }
    };
}
;
}),
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/api/telemetry/config/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$telemetry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/telemetry.ts [app-route] (ecmascript)");
;
;
;
async function GET(request) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$telemetry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolveTelemetryContext"])(request);
    if ('error' in result) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: result.error
        }, {
            status: result.status
        });
    }
    const { ctx } = result;
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createAdminClient"])();
    // Fetch MVP monster_ids for this server
    const { data: mvps } = await supabase.from('mvps').select('monster_id').eq('server_id', ctx.serverId);
    const monsterIds = mvps?.map((m)=>m.monster_id) ?? [];
    // Get current config_version from session
    const { data: session } = await supabase.from('telemetry_sessions').select('config_version').eq('id', ctx.sessionId).single();
    return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        config_version: session?.config_version ?? 1,
        server_id: ctx.serverId,
        group_id: ctx.groupId,
        events: {
            mvp_kill: {
                enabled: true,
                monster_ids: monsterIds,
                batch_window_ms: 3000
            },
            mvp_tomb: {
                enabled: true,
                npc_id: 565
            },
            mvp_killer: {
                enabled: true
            },
            heartbeat: {
                interval_ms: 60000
            }
        }
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__2591ffe3._.js.map