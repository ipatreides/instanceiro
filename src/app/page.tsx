"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeroSection } from "@/components/tracker/hero-section";
import { ServerSelector } from "@/components/tracker/server-selector";
import { InstanceChecklist } from "@/components/tracker/instance-checklist";
import { MvpTracker } from "@/components/tracker/mvp-tracker";
import { useLocalTracker } from "@/hooks/use-local-tracker";
import type { Instance, Mvp } from "@/lib/types";

const SERVER_IDS: Record<string, number> = { freya: 1, nidhogg: 2 };

export default function TrackerPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"instances" | "mvps">("instances");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [mvps, setMvps] = useState<Mvp[]>([]);

  const tracker = useLocalTracker();

  // Redirect logged-in users to dashboard
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

  // Fetch static data
  useEffect(() => {
    if (checking) return;
    Promise.all([
      fetch("/api/instances").then((r) => r.json()),
      fetch(`/api/mvps?server_id=${SERVER_IDS[tracker.server]}`).then((r) => r.json()),
    ]).then(([inst, mvpData]) => {
      setInstances(inst);
      setMvps(mvpData);
    });
  }, [checking, tracker.server]);

  if (checking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <HeroSection />

      <main id="tracker" className="flex-1 max-w-2xl w-full mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-6">
          <ServerSelector server={tracker.server} onServerChange={tracker.setServer} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("instances")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "instances" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Instâncias
            </button>
            <button
              onClick={() => setTab("mvps")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "mvps" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              MVPs
            </button>
          </div>
        </div>

        {tab === "instances" ? (
          <InstanceChecklist
            instances={instances}
            completions={tracker.instances}
            onMarkDone={tracker.markInstanceDone}
            onClear={tracker.clearInstance}
          />
        ) : (
          <MvpTracker
            mvps={mvps}
            kills={tracker.mvpKills}
            serverId={SERVER_IDS[tracker.server]}
            onRegisterKill={tracker.registerMvpKill}
          />
        )}
      </main>

      <footer className="py-6 text-center">
        <p className="text-text-secondary text-sm">
          Feito para jogadores de Ragnarok Online LATAM
        </p>
      </footer>
    </div>
  );
}
