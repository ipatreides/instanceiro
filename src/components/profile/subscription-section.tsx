"use client";

import { useState } from "react";
import { useTier } from "@/hooks/use-tier";
import Link from "next/link";

export function SubscriptionSection() {
  const { tier, isPremium, isFounder, loading } = useTier();
  const [portalLoading, setPortalLoading] = useState(false);

  if (loading) return null;

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  if (isFounder) {
    return null; // Handled by FounderBanner
  }

  if (!isPremium) {
    return (
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="font-semibold text-text-primary text-sm mb-2">Plano</h3>
        <p className="text-text-secondary text-sm mb-3">
          Você está no plano gratuito. Desbloqueie todas as features com o Premium.
        </p>
        <Link
          href="/premium"
          className="inline-block bg-primary text-white font-semibold text-sm px-4 py-2 rounded-md hover:bg-primary-hover transition-colors"
        >
          Ver planos
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="font-semibold text-text-primary text-sm mb-2">Plano Premium</h3>
      <p className="text-text-secondary text-sm mb-3">
        Você tem acesso a todas as features do Instanceiro.
      </p>
      <button
        onClick={handleManageSubscription}
        disabled={portalLoading}
        className="text-sm text-primary hover:underline disabled:opacity-50"
      >
        {portalLoading ? "Abrindo..." : "Gerenciar assinatura"}
      </button>
    </div>
  );
}
