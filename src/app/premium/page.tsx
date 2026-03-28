"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const BENEFITS = [
  "Personagens ilimitados",
  "Contas ilimitadas",
  "Grupos de MVP com amigos",
  "Alertas Discord de spawn",
  "Stats e histórico na nuvem",
  "Sync entre dispositivos",
  "Sugerir novas features",
];

export default function PremiumPage() {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error === "Unauthorized") {
        router.push("/login?redirect=/premium");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-md w-full">
          <div className="flex justify-center mb-6">
            <Logo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-text-primary text-center mb-2">
            Instanceiro Premium
          </h1>
          <p className="text-text-secondary text-center mb-8">
            Desbloqueie todas as features e apoie o projeto
          </p>

          {/* Plan toggle */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <button
              onClick={() => setPlan("monthly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                plan === "monthly"
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary border border-border"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setPlan("yearly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                plan === "yearly"
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary border border-border"
              }`}
            >
              Anual
              <span className="absolute -top-2 -right-2 bg-status-available-text text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                2 meses grátis
              </span>
            </button>
          </div>

          {/* Price card */}
          <div className="bg-surface border border-border rounded-lg p-6 mb-6">
            <div className="text-center mb-4">
              <span className="text-3xl font-bold text-text-primary">
                {plan === "monthly" ? "R$ 9,90" : "R$ 99,90"}
              </span>
              <span className="text-text-secondary text-sm ml-1">
                /{plan === "monthly" ? "mês" : "ano"}
              </span>
              {plan === "yearly" && (
                <p className="text-xs text-text-secondary mt-1">
                  Equivale a R$ 8,33/mês
                </p>
              )}
            </div>

            <ul className="space-y-2 mb-6">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-text-primary">
                  <svg className="w-4 h-4 text-status-available-text flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full bg-primary text-white font-semibold py-3 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Redirecionando..." : "Começar trial de 7 dias"}
            </button>
          </div>

          <p className="text-xs text-text-secondary text-center">
            Cancele a qualquer momento. Sem compromisso.
          </p>
        </div>
      </main>
    </div>
  );
}
