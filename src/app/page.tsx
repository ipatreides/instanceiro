"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoginButton } from "@/components/auth/login-button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 text-left hover:border-primary/40 transition-colors">
      <div className="text-primary mb-3">{icon}</div>
      <h3 className="text-text-primary font-semibold text-sm mb-1">{title}</h3>
      <p className="text-text-secondary text-sm leading-relaxed">{description}</p>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Theme toggle — fixed top-right */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-2xl w-full text-center space-y-10">
          {/* Hero */}
          <div className="space-y-4">
            <div className="flex justify-center">
              <Logo size="lg" />
            </div>
            <p className="text-text-secondary text-lg max-w-md mx-auto leading-relaxed">
              Acompanhe suas instâncias de Ragnarok Online.
              Gerencie cooldowns, histórico e progresso de todos os seus personagens em um só lugar.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" stroke="var(--primary)" fill="none">
                  <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="var(--primary)" fillOpacity="var(--icon-fill-opacity)" stroke="var(--primary)" />
                </svg>
              }
              title="Cooldowns em tempo real"
              description="Saiba exatamente quando cada instância fica disponível, com timers que atualizam automaticamente."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" stroke="var(--primary)" fill="none">
                  <path d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" fill="var(--primary)" fillOpacity="var(--icon-fill-opacity)" stroke="var(--primary)" />
                </svg>
              }
              title="Histórico completo"
              description="Registre cada conclusão e acompanhe seu progresso ao longo do tempo."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" stroke="var(--primary)" fill="none">
                  <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" fill="var(--primary)" fillOpacity="var(--icon-fill-opacity)" stroke="var(--primary)" />
                </svg>
              }
              title="Multi-personagem"
              description="Gerencie instâncias de todos os seus personagens em um único painel."
            />
          </div>

          {/* CTA — Social Login */}
          <LoginButton />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-text-secondary text-sm">
          Feito para jogadores de Ragnarok Online LATAM
        </p>
      </footer>
    </div>
  );
}
// test
const x = "bg-[#7C3AED] text-[#A89BC2]";
