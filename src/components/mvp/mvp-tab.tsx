"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { Account, Character, Mvp, MvpActiveKill } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";
import { MvpKillModal } from "./mvp-kill-modal";
import { MvpMapPicker } from "./mvp-map-picker";
import { MvpGroupHub } from "./mvp-group-hub";
import { MvpGroupStats } from "./mvp-group-stats";
import { TelemetryTab } from "./telemetry-tab";
import { MvpDamagePanel } from "./mvp-damage-panel";
import { Navigation, ChevronDown, ChevronRight } from "lucide-react";
import { useMvpSightings } from "@/hooks/use-mvp-sightings";
import { useMvpBroadcasts } from "@/hooks/use-mvp-broadcasts";
import { formatTimeBRT, formatDateBRT } from "@/lib/date-brt";

const GROUP_DISPLAY_NAMES: Record<string, string> = {
  bio_lab_3: "Bio Lab 3",
  bio_lab_5: "Bio Lab 5",
  beelzebub: "Beelzebub",
};

interface KillHistoryEntry {
  id: string;
  mvp_id: number;
  killed_at: string;
  killer_name: string | null;
  registered_by_name: string;
  tomb_x: number | null;
  tomb_y: number | null;
  source: string | null;
  has_damage: boolean;
}

interface MvpTabProps {
  selectedCharId: string | null;
  characters: Character[];
  accounts: Account[];
  userId?: string | null;
  onHasUrgentMvp?: (hasUrgent: boolean) => void;
}

function formatRespawn(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `~${h}h${m}min`;
  if (h > 0) return `~${h}h`;
  return `~${m}min`;
}

function formatCountdown(ms: number): string {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

export function MvpTab({ selectedCharId, characters, accounts, userId }: MvpTabProps) {
  const [search, setSearch] = useState("");
  const [selectedMvp, setSelectedMvp] = useState<Mvp | null>(null);
  const [showKillModal, setShowKillModal] = useState(false);
  const [modalInitialTime, setModalInitialTime] = useState<string | null>(null);
  const [modalKill, setModalKill] = useState<MvpActiveKill | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hubTab, setHubTab] = useState<"grupo" | "stats" | "telemetria">("grupo");
  const [now, setNow] = useState(Date.now());
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const prevKillsRef = useRef<MvpActiveKill[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [memberUsernames, setMemberUsernames] = useState<Map<string, string>>(new Map());
  const [witnesses, setWitnesses] = useState<Record<string, string[]>>({}) // kill_id → user_id[]
  const [expandedHistoryKillId, setExpandedHistoryKillId] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  const { mvps, mapMeta, drops, loading: mvpLoading } = useMvpData(serverId);
  const { group, members, loading: groupLoading, createGroup, updateGroup, inviteCharacter, leaveGroup } = useMvpGroups(selectedCharId);
  const { activeKills, loading: killsLoading, registerKill, editKill, deleteKill, acceptLootSuggestions, rejectLootSuggestion, confirmKill, correctKill } = useMvpTimers(group?.id ?? null, serverId);
  const sightings = useMvpSightings(group?.id ?? null);
  const broadcasts = useMvpBroadcasts(group?.id ?? null);

  const loading = mvpLoading || groupLoading || killsLoading;

  // Detect kills corrected via realtime
  useEffect(() => {
    for (const kill of activeKills) {
      const prev = prevKillsRef.current.find(k => k.kill_id === kill.kill_id)
      if (prev && prev.validation_status !== 'corrected' && kill.validation_status === 'corrected') {
        const mvp = mvps.find(m => m.id === kill.mvp_id)
        if (mvp) {
          setCorrectionNotice(`Kill de ${mvp.name} foi corrigido`)
          setTimeout(() => setCorrectionNotice(null), 8000)
        }
      }
    }
    prevKillsRef.current = activeKills
  }, [activeKills, mvps])

  // Resolve member names (own chars from props + friends via RPC)
  useEffect(() => {
    const allCharIds = new Set(members.map((m) => m.character_id));
    if (allCharIds.size === 0) { setMemberNames(new Map()); return; }
    const nameMap = new Map<string, string>();
    for (const c of characters) nameMap.set(c.id, c.name);
    const missing = [...allCharIds].filter((id) => !nameMap.has(id));
    if (missing.length === 0) { setMemberNames(nameMap); return; }
    const supabase = createClient();
    supabase.rpc("get_character_names", { char_ids: missing }).then(({ data }) => {
      for (const c of ((data ?? []) as { id: string; name: string }[])) nameMap.set(c.id, c.name);
      setMemberNames(new Map(nameMap));
    });

    // Also fetch usernames for group members
    const userIds = [...new Set(members.map((m) => m.user_id))];
    if (userIds.length > 0) {
      supabase.from("profiles").select("id, username").in("id", userIds).then(({ data }) => {
        const uMap = new Map<string, string>();
        for (const p of (data ?? [])) uMap.set(p.id, p.username ?? "?");
        setMemberUsernames(uMap);
      });
    }
  }, [members, characters]);

  // Fetch witnesses for pending telemetry kills
  useEffect(() => {
    const pendingKillIds = activeKills
      .filter(k => k.source === 'telemetry' && k.validation_status === 'pending')
      .map(k => k.kill_id)

    if (pendingKillIds.length === 0) {
      setWitnesses({})
      return
    }

    const supabase = createClient()
    supabase
      .from('mvp_kill_witnesses')
      .select('kill_id, user_id')
      .in('kill_id', pendingKillIds)
      .then(({ data }) => {
        const map: Record<string, string[]> = {}
        for (const w of data ?? []) {
          if (!map[w.kill_id]) map[w.kill_id] = []
          map[w.kill_id].push(w.user_id)
        }
        setWitnesses(map)
      })
  }, [activeKills])

  // Parties for modal (empty array — parties are now managed in hub)
  const partiesForModal: { id: string; name: string; memberIds: string[] }[] = [];

  const selectedKill = useMemo(() => {
    if (!selectedMvp) return null;

    // Direct kill for this MVP
    const directKill = activeKills.find((k) => k.mvp_id === selectedMvp.id) ?? null;

    // If MVP has a cooldown group, find the latest kill across the group
    if (selectedMvp.cooldown_group) {
      const groupMvpIds = new Set(
        mvps
          .filter((m) => m.cooldown_group === selectedMvp.cooldown_group)
          .map((m) => m.id)
      );
      let latestKill: MvpActiveKill | null = null;
      for (const kill of activeKills) {
        if (groupMvpIds.has(kill.mvp_id)) {
          if (!latestKill || (kill.killed_at ?? "") > (latestKill.killed_at ?? "")) {
            latestKill = kill;
          }
        }
      }
      return latestKill;
    }

    return directKill;
  }, [selectedMvp, activeKills, mvps]);

  // Kill history — fetch ALL group kills once, filter per MVP locally
  const [allKillHistory, setAllKillHistory] = useState<KillHistoryEntry[]>([]);
  useEffect(() => {
    const supabase = createClient();
    const query = supabase
      .from("mvp_kills")
      .select("id, mvp_id, killed_at, tomb_x, tomb_y, killer_character_id, registered_by, source, mvp_kill_damage_hits(count)");
    if (group) query.eq("group_id", group.id);
    else query.is("group_id", null);
    query.order("killed_at", { ascending: false })
      .limit(200);
    query
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setAllKillHistory([]); return; }
        const charIds = [...new Set(data.flatMap((d) => [d.killer_character_id, d.registered_by].filter(Boolean) as string[]))];
        const { data: names } = await supabase.rpc("get_character_names", { char_ids: charIds });
        const nameMap = new Map(((names ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        setAllKillHistory(data.map((d: any) => ({
          id: d.id,
          mvp_id: d.mvp_id,
          killed_at: d.killed_at,
          killer_name: d.killer_character_id ? nameMap.get(d.killer_character_id) ?? null : null,
          registered_by_name: nameMap.get(d.registered_by) ?? "?",
          tomb_x: d.tomb_x,
          tomb_y: d.tomb_y,
          source: d.source ?? null,
          has_damage: (d.mvp_kill_damage_hits?.[0]?.count ?? 0) > 0,
        })));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  // Build MVP name lookup map
  const mvpNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of mvps) map.set(m.id, m.name);
    return map;
  }, [mvps]);

  // Filter history for selected MVP (or all group MVPs if grouped)
  const killHistory = useMemo(() => {
    if (!selectedMvp) return [];
    if (selectedMvp.cooldown_group) {
      const groupIds = new Set(
        mvps.filter((m) => m.cooldown_group === selectedMvp.cooldown_group).map((m) => m.id)
      );
      return allKillHistory.filter((h) => groupIds.has(h.mvp_id)).slice(0, 20);
    }
    return allKillHistory.filter((h) => h.mvp_id === selectedMvp.id).slice(0, 20);
  }, [selectedMvp, allKillHistory, mvps]);

  // Resolve the specific MVP name that was killed (for grouped MVPs)
  const killedMvpName = useMemo(() => {
    if (!selectedMvp?.cooldown_group || !selectedKill) return null;
    return mvpNameMap.get(selectedKill.mvp_id) ?? null;
  }, [selectedMvp, selectedKill, mvpNameMap]);

  const handleSelectMvp = useCallback((mvp: Mvp) => {
    setSelectedMvp(mvp);
    setConfirmingDelete(false);
  }, []);

  const handleKillNow = useCallback(() => {
    if (!selectedMvp) return;
    if (selectedKill?.killed_at) {
      const spawnStart = new Date(selectedKill.killed_at).getTime() + selectedMvp.respawn_ms;
      if (now < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm("Este MVP já tem timer ativo. Substituir?")) return;
      }
    }
    setModalKill(null);
    setModalInitialTime("now");
    setShowKillModal(true);
  }, [selectedMvp, selectedKill, now]);

  const handleKillSetTime = useCallback(() => {
    if (!selectedMvp) return;
    if (selectedKill?.killed_at) {
      const spawnStart = new Date(selectedKill.killed_at).getTime() + selectedMvp.respawn_ms;
      if (now < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm("Este MVP já tem timer ativo. Substituir?")) return;
      }
    }
    setModalKill(null);
    setModalInitialTime(null);
    setShowKillModal(true);
  }, [selectedMvp, selectedKill, now]);

  const handleEdit = useCallback(() => {
    if (!selectedMvp || !selectedKill) return;
    setModalKill(selectedKill);
    setModalInitialTime(null);
    setShowKillModal(true);
  }, [selectedMvp, selectedKill]);

  const handleConfirmKill = useCallback(async (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
    partyMemberIds: string[];
  }) => {
    if (!selectedMvp || !selectedCharId) return;
    if (modalKill) {
      await editKill(modalKill.kill_id, {
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        editedBy: selectedCharId,
      });
    } else {
      await registerKill({
        mvpId: selectedMvp.id,
        groupId: group?.id ?? null,
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        registeredBy: selectedCharId,
        loots: data.selectedLoots,
        partyMemberIds: data.partyMemberIds,
      });
    }
    setShowKillModal(false);
  }, [selectedMvp, modalKill, selectedCharId, group, registerKill, editKill]);

  const handleDeleteKill = useCallback(async () => {
    if (!selectedKill) return;
    await deleteKill(selectedKill.kill_id);
    setShowKillModal(false);
  }, [selectedKill, deleteKill]);

  const handleRowConfirmKill = useCallback(async (killId: string) => {
    if (!selectedCharId) return;
    await confirmKill(killId, selectedCharId);
  }, [selectedCharId, confirmKill]);

  const handleRowCorrectKill = useCallback((mvp: Mvp, kill: MvpActiveKill) => {
    setSelectedMvp(mvp);
    setModalKill(kill);
    setModalInitialTime(null);
    setShowKillModal(true);
  }, []);

  const detailStatus: { remaining: number; isAlive: boolean; countUp: number; mechanicMode: boolean; unknownTime: boolean } | null = selectedMvp && selectedKill ? (() => {
    if (!selectedKill.killed_at || new Date(selectedKill.killed_at).getTime() < 86400000) return { remaining: 0, isAlive: false, countUp: 0, mechanicMode: false, unknownTime: true };
    const killedAt = new Date(selectedKill.killed_at).getTime();
    const spawnStart = killedAt + selectedMvp.respawn_ms;
    const spawnEnd = spawnStart + selectedMvp.delay_ms;
    const remaining = spawnStart - now;
    const isAlive = now >= spawnStart;
    const countUp = isAlive ? now - spawnEnd : 0;
    const mechanicMode = isAlive && selectedMvp.cooldown_group === 'bio_lab_5';
    return { remaining, isAlive, countUp, mechanicMode, unknownTime: false };
  })() : null;

  return (
    <div className="flex gap-0 border border-border rounded-lg overflow-hidden bg-bg flex-1 min-h-0">
      {/* LEFT PANEL — MVP List (1/3) */}
      <div className="w-1/3 flex flex-col border-r border-border min-w-0">
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar MVP ou mapa..."
            className="w-full rounded-md bg-surface border border-border px-2.5 py-1.5 text-[11px] text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
          />
        </div>

        <button
          onClick={() => { setSelectedMvp(null); setConfirmingDelete(false); }}
          className="px-2 py-1.5 border-b border-border text-left w-full hover:bg-card-hover-bg transition-colors cursor-pointer"
        >
          {group ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Grupo:</span>
              <span className="text-[10px] text-primary-secondary font-medium">{group.name}</span>
              <span className="text-[10px] text-text-secondary ml-auto">⚙</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Modo solo</span>
              <span className="text-[10px] text-text-secondary ml-auto">⚙</span>
            </div>
          )}
        </button>

        <MvpTimerList
          mvps={mvps}
          activeKills={activeKills}
          sightings={sightings}
          broadcasts={broadcasts}
          search={search}
          loading={loading}
          selectedMvpId={selectedMvp?.id ?? null}
          onSelectMvp={handleSelectMvp}
        />
      </div>

      {/* RIGHT PANEL — Detail or Hub (2/3) */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 min-w-0">
        {correctionNotice && (
          <div className="px-3 py-2 bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] text-status-available-text text-sm rounded-md mb-2 flex items-center justify-between">
            <span>{correctionNotice}</span>
            <button onClick={() => setCorrectionNotice(null)} className="text-text-secondary hover:text-text-primary ml-2 cursor-pointer">×</button>
          </div>
        )}
        {!selectedMvp ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Hub tabs */}
            {group && (
              <div className="flex gap-1 mb-3">
                <button
                  onClick={() => setHubTab("grupo")}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                    hubTab === "grupo"
                      ? "text-text-primary border-b-2 border-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Grupo
                </button>
                <button
                  onClick={() => setHubTab("stats")}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                    hubTab === "stats"
                      ? "text-text-primary border-b-2 border-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Stats
                </button>
                <button
                  onClick={() => setHubTab("telemetria")}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                    hubTab === "telemetria"
                      ? "text-text-primary border-b-2 border-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Telemetria
                </button>
              </div>
            )}
            {(!group || hubTab === "grupo") ? (
              <MvpGroupHub
                group={group}
                members={members}
                characters={characters}
                selectedCharId={selectedCharId}
                serverId={serverId}
                memberNames={memberNames}
                memberUsernames={memberUsernames}
                onCreateGroup={createGroup}
                onUpdateGroup={updateGroup}
                onInviteCharacter={inviteCharacter}
                onLeaveGroup={leaveGroup}
              />
            ) : hubTab === "stats" ? (
              <MvpGroupStats groupId={group.id} />
            ) : hubTab === "telemetria" && userId ? (
              <TelemetryTab userId={userId} />
            ) : null}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  {selectedMvp.cooldown_group
                    ? (GROUP_DISPLAY_NAMES[selectedMvp.cooldown_group] ?? selectedMvp.name)
                    : selectedMvp.name}
                </h3>
                <p className="text-[11px] text-text-secondary">
                  {selectedMvp.map_name} · Respawn: {formatRespawn(selectedMvp.respawn_ms)}
                  {selectedKill && selectedKill.kill_count > 0 && ` · ×${selectedKill.kill_count} kills`}
                  {selectedMvp.cooldown_group && (
                    <span className="ml-1" title="Cooldown compartilhado com outros MVPs do grupo">⟷</span>
                  )}
                </p>
                {killedMvpName && (
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Último: <span className="text-primary-secondary">{killedMvpName}</span>
                  </p>
                )}
              </div>
              {selectedKill && detailStatus && (
                <div className="text-right">
                  {detailStatus.unknownTime ? (
                    <>
                      <div className="text-xl font-bold tabular-nums" style={{ color: "var(--status-soon-text)" }}>?</div>
                      <div className="text-[10px]" style={{ color: "var(--status-soon-text)" }}>Hora desconhecida</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-bold tabular-nums" style={{ color: detailStatus.mechanicMode ? "var(--status-soon-text)" : detailStatus.isAlive ? "var(--status-available-text)" : "var(--status-cooldown-text)" }}>
                        {detailStatus.mechanicMode ? "Mecânica" : detailStatus.isAlive ? `+${formatCountdown(detailStatus.countUp)}` : formatCountdown(detailStatus.remaining)}
                      </div>
                      <div className="text-[10px]" style={{ color: detailStatus.mechanicMode ? "var(--status-soon-text)" : detailStatus.isAlive ? "var(--status-available-text)" : "var(--status-cooldown-text)" }}>
                        {detailStatus.mechanicMode ? "Mecânica disponível" : detailStatus.isAlive ? "Provavelmente vivo" : "Cooldown"}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Map + Info */}
            <div className="flex gap-3 mb-3">
              <div className="w-[160px] flex-shrink-0">
                <MvpMapPicker
                  mapName={selectedMvp.map_name}
                  mapMeta={mapMeta.get(selectedMvp.map_name)}
                  tombX={selectedMvp.has_tomb ? (selectedKill?.tomb_x ?? null) : null}
                  tombY={selectedMvp.has_tomb ? (selectedKill?.tomb_y ?? null) : null}
                  onCoordsChange={() => {}}
                  readOnly
                  heatmapPoints={selectedMvp.has_tomb
                    ? killHistory.filter((h) => h.tomb_x != null && h.tomb_y != null).map((h) => ({ x: h.tomb_x!, y: h.tomb_y! }))
                    : []}
                  sighting={sightings.find((s) => s.mvp_id === selectedMvp.id && s.map_name === selectedMvp.map_name) ?? null}
                />
              </div>

              {selectedKill ? (
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <div className="flex gap-3">
                    <div>
                      <span className="text-[9px] text-text-secondary font-semibold">HORA</span>
                      <div className="text-xs text-text-primary">{selectedKill.killed_at && new Date(selectedKill.killed_at).getTime() >= 86400000 ? formatTimeBRT(selectedKill.killed_at) : "Desconhecida"}</div>
                    </div>
                    {selectedMvp.has_tomb && selectedKill.tomb_x != null && (
                      <>
                        <div>
                          <span className="text-[9px] text-text-secondary font-semibold">X</span>
                          <div className="text-xs text-text-primary">{selectedKill.tomb_x}</div>
                        </div>
                        <div>
                          <span className="text-[9px] text-text-secondary font-semibold">Y</span>
                          <div className="text-xs text-text-primary">{selectedKill.tomb_y}</div>
                        </div>
                        <button
                          className="self-end hover:text-primary transition-colors cursor-pointer"
                          title="Copiar /navi"
                          onClick={() => {
                            const map = selectedMvp.map_name;
                            const x = selectedKill.tomb_x;
                            const y = selectedKill.tomb_y;
                            navigator.clipboard.writeText(`/navi ${map} ${x}/${y}`);
                          }}
                        >
                          <Navigation
                            size={14}
                            stroke="var(--primary)"
                            fill="var(--primary)"
                            fillOpacity="var(--icon-fill-opacity)"
                          />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] text-text-secondary">
                    por <span className="text-primary-secondary">{selectedKill.edited_by_name ? `${selectedKill.edited_by_name} (editado)` : selectedKill.registered_by_name}</span>
                  </div>
                  {selectedKill.killer_name && (
                    <div>
                      <span className="text-[9px] text-text-secondary font-semibold">KILLER</span>
                      <div className="mt-0.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] border border-primary text-text-primary">
                          {selectedKill.killer_name}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center">
                  <p className="text-sm text-text-secondary italic">Nenhuma kill registrada</p>
                </div>
              )}
            </div>

            {/* Damage breakdown (telemetry kills only) */}
            {selectedKill && selectedKill.source === 'telemetry' && (
              <MvpDamagePanel killId={selectedKill.kill_id} />
            )}

            {/* Kill history */}
            {killHistory.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                <p className="text-[10px] text-text-secondary font-semibold">HISTÓRICO ({killHistory.length})</p>
                <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto scrollbar-thin">
                  {killHistory.map((h) => {
                    const hasDamage = h.has_damage;
                    const isExpanded = expandedHistoryKillId === h.id;
                    return (
                      <div key={h.id}>
                        <div
                          className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] bg-surface ${hasDamage ? 'cursor-pointer hover:bg-card-hover-bg transition-colors' : ''}`}
                          onClick={hasDamage ? () => setExpandedHistoryKillId(isExpanded ? null : h.id) : undefined}
                        >
                          {hasDamage && (
                            <span className="text-text-secondary flex-shrink-0">
                              {isExpanded
                                ? <ChevronDown size={10} />
                                : <ChevronRight size={10} />}
                            </span>
                          )}
                          <span className="text-text-secondary tabular-nums">
                            {h.killed_at && new Date(h.killed_at).getTime() >= 86400000 ? formatDateBRT(h.killed_at) : "—"}
                          </span>
                          <span className="text-text-secondary tabular-nums">
                            {h.killed_at && new Date(h.killed_at).getTime() >= 86400000 ? formatTimeBRT(h.killed_at) : "Desconhecida"}
                          </span>
                          {selectedMvp.cooldown_group && (
                            <span className="text-text-primary font-medium">{mvpNameMap.get(h.mvp_id) ?? "?"}</span>
                          )}
                          {h.killer_name ? (
                            <span className="text-primary-secondary">{h.killer_name}</span>
                          ) : (
                            <span className="text-text-secondary italic">sem killer</span>
                          )}
                          {selectedMvp.has_tomb && h.tomb_x != null && (
                            <span className="text-text-secondary ml-auto">{h.tomb_x},{h.tomb_y}</span>
                          )}
                          <span className="text-text-secondary ml-auto">por {h.registered_by_name}</span>
                        </div>
                        {isExpanded && hasDamage && (
                          <div className="pl-4 pr-1 pb-1">
                            <MvpDamagePanel killId={h.id} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-3 border-t border-border">
              <button
                onClick={handleKillNow}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer transition-colors"
              >
                ⚔ Matei agora
              </button>
              <button
                onClick={handleKillSetTime}
                className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
              >
                🕐 Informar horário
              </button>
              {selectedKill && (
                <>
                  <button
                    onClick={handleEdit}
                    className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors ml-auto"
                  >
                    ✎ Editar
                  </button>
                  {!confirmingDelete ? (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="px-3 py-1.5 text-xs text-status-error-text hover:opacity-80 cursor-pointer transition-opacity"
                    >
                      Excluir
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { handleDeleteKill(); setConfirmingDelete(false); }}
                        className="px-3 py-1.5 text-xs text-white bg-status-error rounded-md hover:opacity-80 cursor-pointer transition-opacity"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Kill modal */}
      {showKillModal && selectedMvp && (
        <MvpKillModal
          mvp={selectedMvp}
          mapMeta={mapMeta.get(selectedMvp.map_name)}
          drops={drops}
          existingKill={modalKill}
          groupMembers={members}
          characters={characters}
          selectedCharId={selectedCharId}
          isGroupMode={!!group}
          initialTime={modalInitialTime}
          parties={partiesForModal}
          memberNames={memberNames}
          memberUsernames={memberUsernames}
          killerKillCounts={(() => {
            const map = new Map<string, number>();
            for (const h of killHistory) {
              if (h.killer_name) {
                // Find character_id by name from memberNames
                for (const [charId, name] of memberNames) {
                  if (name === h.killer_name) map.set(charId, (map.get(charId) ?? 0) + 1);
                }
              }
            }
            return map;
          })()}
          onConfirm={handleConfirmKill}
          onDelete={modalKill ? handleDeleteKill : undefined}
          onAcceptLootSuggestions={acceptLootSuggestions}
          onRejectLootSuggestion={rejectLootSuggestion}
          onClose={() => setShowKillModal(false)}
        />
      )}
    </div>
  );
}
