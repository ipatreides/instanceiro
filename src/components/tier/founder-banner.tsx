"use client";

import { useTier } from "@/hooks/use-tier";
import type { Subscription } from "@/lib/types";

interface FounderBannerProps {
  subscription: Subscription | null;
  onManageSubscription: () => void;
}

export function FounderBanner({ subscription, onManageSubscription }: FounderBannerProps) {
  const { isFounder } = useTier();

  if (!isFounder) return null;

  const isVoluntarySubscriber = subscription && subscription.status === "active" && subscription.stripe_subscription_id;

  return (
    <div className="bg-surface border border-primary/30 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🛡️</span>
        <h3 className="font-semibold text-text-primary text-sm">
          {isVoluntarySubscriber ? "Membro Fundador & Apoiador" : "Membro Fundador — Acesso Premium Vitalício"}
        </h3>
      </div>
      <p className="text-text-secondary text-sm">
        {isVoluntarySubscriber
          ? "Obrigado por apoiar o Instanceiro!"
          : "Você faz parte dos primeiros usuários do Instanceiro."}
      </p>
      {isVoluntarySubscriber && (
        <button
          onClick={onManageSubscription}
          className="text-xs text-primary hover:underline mt-2"
        >
          Gerenciar assinatura
        </button>
      )}
    </div>
  );
}
