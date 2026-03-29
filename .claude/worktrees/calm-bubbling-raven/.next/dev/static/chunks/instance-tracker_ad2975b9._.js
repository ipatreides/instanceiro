(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PairingPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/instance-tracker/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
function PairContent() {
    _s();
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const code = searchParams.get('code');
    const callback = searchParams.get('callback');
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('idle');
    const [errorMsg, setErrorMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    async function handleConfirm() {
        setStatus('confirming');
        try {
            const res = await fetch('/api/telemetry/pair', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pairing_code: code
                })
            });
            if (!res.ok) {
                const data = await res.json();
                setErrorMsg(data.error || 'Erro ao conectar');
                setStatus('error');
                return;
            }
            const { callback_url } = await res.json();
            setStatus('success');
            // Redirect to sniffer's local callback
            window.location.href = callback_url;
        } catch  {
            setErrorMsg('Erro de conexao');
            setStatus('error');
        }
    }
    if (!code) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex min-h-screen items-center justify-center bg-bg",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-text-secondary",
                children: "Codigo de pareamento nao encontrado."
            }, void 0, false, {
                fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                lineNumber: 43,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
            lineNumber: 42,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex min-h-screen items-center justify-center bg-bg",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-surface border border-border rounded-lg p-8 max-w-md w-full text-center",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                    className: "text-xl font-semibold text-text-primary mb-4",
                    children: "Conectar Sniffer"
                }, void 0, false, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 51,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-text-secondary mb-6",
                    children: "Confirme o codigo abaixo para conectar seu sniffer ao Instanceiro."
                }, void 0, false, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 52,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "bg-bg border border-border rounded-md p-4 mb-6",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "font-mono text-2xl font-bold text-primary tracking-wider",
                        children: code
                    }, void 0, false, {
                        fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                        lineNumber: 56,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this),
                status === 'idle' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: handleConfirm,
                    className: "w-full bg-primary text-white font-semibold rounded-md py-3 hover:bg-primary-hover transition-colors",
                    children: "Confirmar conexao"
                }, void 0, false, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 60,
                    columnNumber: 11
                }, this),
                status === 'confirming' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-text-secondary",
                    children: "Conectando..."
                }, void 0, false, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 69,
                    columnNumber: 11
                }, this),
                status === 'success' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-status-available-text font-semibold",
                    children: "Conectado! Voce pode fechar esta janela."
                }, void 0, false, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 73,
                    columnNumber: 11
                }, this),
                status === 'error' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-status-error-text mb-4",
                            children: errorMsg
                        }, void 0, false, {
                            fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                            lineNumber: 80,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>setStatus('idle'),
                            className: "text-primary underline text-sm",
                            children: "Tentar novamente"
                        }, void 0, false, {
                            fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                            lineNumber: 81,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                    lineNumber: 79,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
            lineNumber: 50,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
        lineNumber: 49,
        columnNumber: 5
    }, this);
}
_s(PairContent, "OHEh7cjcdgYNYbEcYLZEocGGwyU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"]
    ];
});
_c = PairContent;
function PairingPage() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Suspense"], {
        fallback: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex min-h-screen items-center justify-center bg-bg",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-text-secondary",
                children: "Carregando..."
            }, void 0, false, {
                fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
                lineNumber: 96,
                columnNumber: 94
            }, void 0)
        }, void 0, false, {
            fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
            lineNumber: 96,
            columnNumber: 25
        }, void 0),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$instance$2d$tracker$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PairContent, {}, void 0, false, {
            fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
            lineNumber: 97,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/instance-tracker/.claude/worktrees/calm-bubbling-raven/src/app/telemetry/pair/page.tsx",
        lineNumber: 96,
        columnNumber: 5
    }, this);
}
_c1 = PairingPage;
var _c, _c1;
__turbopack_context__.k.register(_c, "PairContent");
__turbopack_context__.k.register(_c1, "PairingPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/instance-tracker/node_modules/next/navigation.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = __turbopack_context__.r("[project]/instance-tracker/node_modules/next/dist/client/components/navigation.js [app-client] (ecmascript)");
}),
]);

//# sourceMappingURL=instance-tracker_ad2975b9._.js.map