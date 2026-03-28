"use client";

import { useState } from "react";
import { useTier } from "@/hooks/use-tier";

export function GiftCodeSection() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { refreshTier } = useTier();

  const handleRedeem = async () => {
    if (!code.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/gift/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        const label = data.status === "gifted_lifetime"
          ? "Premium vitalício"
          : data.period_end
            ? `Premium até ${new Date(data.period_end).toLocaleDateString("pt-BR")}`
            : "Premium ativado";
        setMessage(label);
        setCode("");
        await refreshTier();
      } else {
        setStatus("error");
        const errors: Record<string, string> = {
          invalid_code: "Código inválido",
          already_redeemed: "Este código já foi utilizado",
          expired: "Este código expirou",
          rate_limited: "Muitas tentativas. Aguarde um minuto.",
        };
        setMessage(errors[data.error] ?? "Erro ao resgatar código");
      }
    } catch {
      setStatus("error");
      setMessage("Erro de conexão");
    }
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="font-semibold text-text-primary text-sm mb-2">Código de Resgate</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setStatus("idle");
          }}
          placeholder="XXXXXXXXXXXX"
          maxLength={20}
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
        <button
          onClick={handleRedeem}
          disabled={status === "loading" || !code.trim()}
          className="bg-primary text-white font-semibold text-sm px-4 py-2 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {status === "loading" ? "..." : "Resgatar"}
        </button>
      </div>
      {status === "success" && (
        <p className="text-xs text-status-available-text mt-2">{message}</p>
      )}
      {status === "error" && (
        <p className="text-xs text-status-error-text mt-2">{message}</p>
      )}
    </div>
  );
}
