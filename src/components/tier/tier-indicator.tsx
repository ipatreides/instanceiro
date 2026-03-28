"use client";

import Link from "next/link";
import { useTier } from "@/hooks/use-tier";

export function TierIndicator() {
  const { tier, loading } = useTier();

  if (loading) return null;

  if (tier === "legacy_premium") {
    return (
      <span className="text-xs font-semibold text-primary" title="Membro Fundador">
        ⭐ Fundador
      </span>
    );
  }

  if (tier === "premium") {
    return (
      <span className="text-xs font-semibold text-primary" title="Premium">
        ⭐
      </span>
    );
  }

  return (
    <Link
      href="/premium"
      className="text-xs text-text-secondary hover:text-primary transition-colors"
    >
      Upgrade
    </Link>
  );
}
