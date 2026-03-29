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
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/api/telemetry/mvp-kill/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$supabase$2f$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/supabase/admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f2e$claude$2f$worktrees$2f$calm$2d$bubbling$2d$raven$2f$src$2f$lib$2f$telemetry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/lib/telemetry.ts [app-route] (ecmascript)");
;
;
;
async function POST(request) {
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
    const body = await request.json();
    const { monster_id, map, x, y, timestamp, loots, party_character_ids } = body;
    if (!monster_id || !map || timestamp == null) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Missing required fields'
        }, {
            status: 400
        });
    }
    // Resolve monster_id → mvp_id
    const { data: mvp } = await supabase.from('mvps').select('id').eq('monster_id', monster_id).eq('server_id', ctx.serverId).limit(1).single();
    if (!mvp) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Unknown MVP for this server'
        }, {
            status: 400
        });
    }
    // Resolve character row UUID for registered_by
    const { data: charRow } = await supabase.from('characters').select('id').eq('user_id', ctx.userId).limit(1).single();
    if (!charRow) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Character not found'
        }, {
            status: 400
        });
    }
    const registeredBy = charRow.id;
    const killedAt = new Date(timestamp * 1000).toISOString();
    // Dedup: same mvp_id in group within last 30 seconds
    const dedupCutoff = new Date(timestamp * 1000 - 30000).toISOString();
    const { data: existing } = await supabase.from('mvp_kills').select('id').eq('mvp_id', mvp.id).eq('group_id', ctx.groupId).gte('killed_at', dedupCutoff).limit(1);
    if (existing && existing.length > 0) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            action: 'dedup'
        });
    }
    // Overwrite: delete active kill for this MVP if exists (older than 30s)
    await supabase.from('mvp_kills').delete().eq('mvp_id', mvp.id).eq('group_id', ctx.groupId).lt('killed_at', dedupCutoff);
    // Insert new kill
    const { data: kill, error: killErr } = await supabase.from('mvp_kills').insert({
        group_id: ctx.groupId,
        mvp_id: mvp.id,
        killed_at: killedAt,
        tomb_x: x ?? null,
        tomb_y: y ?? null,
        registered_by: registeredBy,
        source: 'telemetry',
        telemetry_session_id: ctx.sessionId
    }).select('id').single();
    if (killErr || !kill) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Failed to insert kill'
        }, {
            status: 500
        });
    }
    // Insert loots as suggestions
    if (loots && Array.isArray(loots) && loots.length > 0) {
        // Resolve item names from items table
        const itemIds = loots.map((l)=>l.item_id);
        const { data: items } = await supabase.from('items').select('item_id, name_pt').in('item_id', itemIds);
        const itemNameMap = new Map(items?.map((i)=>[
                i.item_id,
                i.name_pt
            ]) ?? []);
        const lootRows = loots.map((l)=>({
                kill_id: kill.id,
                item_id: l.item_id,
                item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
                quantity: l.amount ?? 1,
                source: 'telemetry',
                accepted: null
            }));
        await supabase.from('mvp_kill_loots').insert(lootRows);
    }
    // Insert party members — resolve RO character IDs (integers) to character UUIDs
    if (party_character_ids && Array.isArray(party_character_ids) && party_character_ids.length > 0) {
        // Look up character UUIDs for this group's members by user
        const { data: groupMembers } = await supabase.from('mvp_group_members').select('character_id, characters!inner(id, user_id)').eq('group_id', ctx.groupId);
        // Build a map from user_id → character UUID for group members
        const memberCharMap = new Map((groupMembers ?? []).map((m)=>[
                m.characters.user_id,
                m.character_id
            ]));
        // Resolve each RO character ID to a group member character UUID via telemetry sessions
        const { data: sessions } = await supabase.from('telemetry_sessions').select('user_id, character_id').eq('group_id', ctx.groupId).in('character_id', party_character_ids);
        const resolvedIds = (sessions ?? []).map((s)=>memberCharMap.get(s.user_id)).filter((id)=>id !== undefined);
        if (resolvedIds.length > 0) {
            const partyRows = resolvedIds.map((charUuid)=>({
                    kill_id: kill.id,
                    character_id: charUuid
                }));
            await supabase.from('mvp_kill_party').insert(partyRows);
        }
    }
    // queue_mvp_alerts trigger fires automatically on insert
    return __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        action: 'created',
        kill_id: kill.id
    }, {
        status: 201
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__4d7c5c24._.js.map