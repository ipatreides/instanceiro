"use client";

import { useTier } from "@/hooks/use-tier";
import { PremiumBadge } from "./premium-badge";

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
  fallback?: React.ReactNode;
}

export function PremiumGate({ children, feature, fallback }: PremiumGateProps) {
  const { isPremium, loading } = useTier();

  if (loading) return <>{children}</>;

  if (isPremium) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute top-1 right-1">
        <PremiumBadge feature={feature} />
      </div>
    </div>
  );
}
