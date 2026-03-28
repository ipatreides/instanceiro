import type { TrackerLocalData, TrackerInstanceData, TrackerMvpKillData } from "@/lib/types";

const STORAGE_KEY = "instanceiro_tracker";

function getTrackerData(): TrackerLocalData {
  if (typeof window === "undefined") {
    return { server: "freya", instances: {}, mvp_kills: {}, active_instances: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { server: "freya", instances: {}, mvp_kills: {}, active_instances: null };
    const parsed = JSON.parse(raw);
    return {
      server: parsed.server ?? "freya",
      instances: parsed.instances ?? {},
      mvp_kills: parsed.mvp_kills ?? {},
      active_instances: parsed.active_instances ?? null,
    };
  } catch {
    return { server: "freya", instances: {}, mvp_kills: {}, active_instances: null };
  }
}

function saveTrackerData(data: TrackerLocalData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getServer(): string {
  return getTrackerData().server;
}

export function setServer(server: string): void {
  const data = getTrackerData();
  data.server = server;
  saveTrackerData(data);
}

export function getInstanceCompletions(): Record<string, TrackerInstanceData> {
  return getTrackerData().instances;
}

export function markInstanceComplete(instanceId: string): void {
  const data = getTrackerData();
  data.instances[instanceId] = { completed_at: new Date().toISOString() };
  saveTrackerData(data);
}

export function clearInstanceCompletion(instanceId: string): void {
  const data = getTrackerData();
  delete data.instances[instanceId];
  saveTrackerData(data);
}

export function getMvpKills(): Record<string, TrackerMvpKillData> {
  return getTrackerData().mvp_kills;
}

export function registerMvpKill(mvpId: string): void {
  const data = getTrackerData();
  data.mvp_kills[mvpId] = { killed_at: new Date().toISOString() };
  saveTrackerData(data);
}

/**
 * Returns the set of active instance IDs, or null if the user has never
 * configured active instances (meaning ALL instances are active by default).
 */
export function getActiveInstances(): Record<string, boolean> | null {
  return getTrackerData().active_instances ?? null;
}

export function setInstanceActive(instanceId: string, active: boolean): void {
  const data = getTrackerData();
  if (!data.active_instances) {
    // First time — user is explicitly toggling, so we initialize the set
    data.active_instances = {};
  }
  data.active_instances[instanceId] = active;
  saveTrackerData(data);
}

/**
 * Returns true if the given instance is "active" for the tracker.
 * When active_instances is null (never configured), all instances are active.
 */
export function isInstanceActive(instanceId: string): boolean {
  const map = getTrackerData().active_instances;
  if (map === null) return true;
  return map[instanceId] !== false;
}

export function getFullTrackerData(): TrackerLocalData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackerLocalData;
  } catch {
    return null;
  }
}

export function clearTrackerData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasTrackerData(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function setDowngradeExported(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("instanceiro_downgrade_exported", "true");
}

export function wasDowngradeExported(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("instanceiro_downgrade_exported") === "true";
}

export function exportToLocalStorage(
  instances: Record<string, TrackerInstanceData>,
  mvpKills: Record<string, TrackerMvpKillData>,
  server: string
): void {
  const data: TrackerLocalData = { server, instances, mvp_kills: mvpKills, active_instances: null };
  saveTrackerData(data);
  setDowngradeExported();
}
