"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getServer,
  setServer as setServerStorage,
  getInstanceCompletions,
  markInstanceComplete as markComplete,
  clearInstanceCompletion,
  getMvpKills,
  registerMvpKill as registerKill,
  getActiveInstances,
  setInstanceActive,
} from "@/lib/local-tracker";
import type { TrackerInstanceData, TrackerMvpKillData } from "@/lib/types";

export function useLocalTracker() {
  const [server, setServerState] = useState("freya");
  const [instances, setInstances] = useState<Record<string, TrackerInstanceData>>({});
  const [mvpKills, setMvpKills] = useState<Record<string, TrackerMvpKillData>>({});
  // null = never configured (all active by default)
  const [activeInstances, setActiveInstancesState] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    setServerState(getServer());
    setInstances(getInstanceCompletions());
    setMvpKills(getMvpKills());
    setActiveInstancesState(getActiveInstances());
  }, []);

  const setServer = useCallback((s: string) => {
    setServerStorage(s);
    setServerState(s);
  }, []);

  const markInstanceDone = useCallback((instanceId: string) => {
    markComplete(instanceId);
    setInstances(getInstanceCompletions());
  }, []);

  const clearInstance = useCallback((instanceId: string) => {
    clearInstanceCompletion(instanceId);
    setInstances(getInstanceCompletions());
  }, []);

  const toggleInstanceActive = useCallback((instanceId: string, active: boolean) => {
    setInstanceActive(instanceId, active);
    setActiveInstancesState(getActiveInstances());
  }, []);

  const registerMvpKill = useCallback(
    async (mvpId: string, serverId: number) => {
      registerKill(mvpId);
      setMvpKills(getMvpKills());

      // Fire-and-forget POST to API
      try {
        await fetch("/api/mvp-kills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mvp_id: parseInt(mvpId, 10),
            killed_at: new Date().toISOString(),
            server_id: serverId,
          }),
        });
      } catch {
        // Silently fail — local data is source of truth
      }
    },
    []
  );

  return {
    server,
    setServer,
    instances,
    mvpKills,
    activeInstances,
    markInstanceDone,
    clearInstance,
    toggleInstanceActive,
    registerMvpKill,
  };
}
