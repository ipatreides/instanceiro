"use client";

import { useState, useCallback } from "react";
import type { Mvp, MvpActiveKill, MvpDrop, MvpMapMeta, MvpGroupMember, Character } from "@/lib/types";
import { MvpMapPicker } from "./mvp-map-picker";

interface MvpKillModalProps {
  mvp: Mvp;
  mapMeta: MvpMapMeta | undefined;
  drops: MvpDrop[];
  existingKill: MvpActiveKill | null;
  groupMembers: MvpGroupMember[];
  characters: Character[];
  selectedCharId: string | null;
  isGroupMode: boolean;
  initialTime: string | null;
  parties: { id: string; name: string; memberIds: string[] }[];
  memberNames: Map<string, string>;
  memberUsernames: Map<string, string>; // userId -> username
  killerKillCounts?: Map<string, number>; // character_id -> kill count for this MVP
  onConfirm: (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
    partyMemberIds: string[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRespawn(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export function MvpKillModal({
  mvp,
  mapMeta,
  drops,
  existingKill,
  groupMembers,
  characters,
  selectedCharId,
  isGroupMode,
  initialTime,
  parties,
  onConfirm,
  onDelete,
  onClose,
  memberNames,
  memberUsernames,
  killerKillCounts,
}: MvpKillModalProps) {
  const isEdit = !!existingKill;

  const [timeStr, setTimeStr] = useState(() => {
    if (existingKill) return formatTimeInput(new Date(existingKill.killed_at));
    if (initialTime === "now") return formatTimeInput(new Date());
    return "";
  });

  const [tombX, setTombX] = useState<number | null>(existingKill?.tomb_x ?? null);
  const [tombY, setTombY] = useState<number | null>(existingKill?.tomb_y ?? null);

  const [killerId, setKillerId] = useState<string | null>(
    existingKill?.killer_character_id ?? (initialTime === "now" ? selectedCharId : null)
  );

  const mvpDrops = drops
    .filter((d) => d.mvp_monster_id === mvp.monster_id)
    .sort((a, b) => (a.drop_rate ?? 100) - (b.drop_rate ?? 100));
  const [selectedLoots, setSelectedLoots] = useState<Set<number>>(new Set());
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [partyMemberIds, setPartyMemberIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleCoordsChange = useCallback((x: number | null, y: number | null) => {
    setTombX(x);
    setTombY(y);
  }, []);

  const toggleLoot = (itemId: number) => {
    setSelectedLoots((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSelectParty = (party: { id: string; name: string; memberIds: string[] }) => {
    if (selectedPartyId === party.id) {
      setSelectedPartyId(null);
      setPartyMemberIds(new Set());
    } else {
      setSelectedPartyId(party.id);
      setPartyMemberIds(new Set(party.memberIds));
    }
  };

  const togglePartyMember = (charId: string) => {
    setPartyMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!timeStr) return;
    const [hours, minutes] = timeStr.split(":").map(Number);
    const killedAt = new Date();
    killedAt.setHours(hours, minutes, 0, 0);
    if (killedAt.getTime() > Date.now()) {
      killedAt.setDate(killedAt.getDate() - 1);
    }

    setSubmitting(true);
    try {
      await onConfirm({
        killedAt: killedAt.toISOString(),
        tombX: mvp.has_tomb ? tombX : null,
        tombY: mvp.has_tomb ? tombY : null,
        killerCharacterId: killerId,
        selectedLoots: [...selectedLoots].map((itemId) => {
          const drop = mvpDrops.find((d) => d.item_id === itemId);
          return { itemId, itemName: drop?.item_name ?? `Item #${itemId}` };
        }),
        partyMemberIds: [...partyMemberIds],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const killerCandidates = isGroupMode
    ? groupMembers.map((m) => ({
        id: m.character_id,
        name: memberNames.get(m.character_id) ?? "?",
        killCount: killerKillCounts?.get(m.character_id) ?? 0,
      })).sort((a, b) => b.killCount - a.killCount)
    : selectedCharId
      ? [{ id: selectedCharId, name: memberNames.get(selectedCharId) ?? characters.find((c) => c.id === selectedCharId)?.name ?? "?", killCount: 0 }]
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg w-full max-w-[720px] max-h-[66vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-text-primary">{mvp.name}</h3>
              <p className="text-[11px] text-text-secondary">
                {mvp.map_name} · Respawn: {formatRespawn(mvp.respawn_ms)}
              </p>
            </div>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg cursor-pointer">×</button>
          </div>

          {/* Two-column layout */}
          <div className="flex gap-4">
            {/* Left: Map + Time + Coords */}
            <div className="w-[300px] flex-shrink-0 flex flex-col gap-2">
              {mvp.has_tomb && (
                <MvpMapPicker
                  mapName={mvp.map_name}
                  mapMeta={mapMeta}
                  tombX={tombX}
                  tombY={tombY}
                  onCoordsChange={handleCoordsChange}
                />
              )}
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <label className="text-[9px] text-text-secondary font-semibold">HORA</label>
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    tabIndex={1}
                    className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                  />
                </div>
                {mvp.has_tomb && (
                  <div className="w-[50px]">
                    <label className="text-[9px] text-text-secondary font-semibold">X</label>
                    <input
                      type="number"
                      value={tombX ?? ""}
                      onChange={(e) => setTombX(e.target.value ? Number(e.target.value) : null)}
                      tabIndex={2}
                      className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                    />
                  </div>
                )}
                {mvp.has_tomb && (
                  <div className="w-[50px]">
                    <label className="text-[9px] text-text-secondary font-semibold">Y</label>
                    <input
                      type="number"
                      value={tombY ?? ""}
                      onChange={(e) => setTombY(e.target.value ? Number(e.target.value) : null)}
                      tabIndex={3}
                      className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Killer + Party + Loot */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              {/* Killer */}
              <div>
                <p className="text-[10px] text-text-secondary font-semibold mb-1">
                  {isGroupMode ? "KILLER" : "EU MATEI"}
                </p>
            <div className="flex flex-wrap gap-1.5">
              {killerCandidates.map((c) => {
                const isSelected = killerId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setKillerId(isSelected ? null : c.id)}
                    className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] border border-primary text-text-primary"
                        : "bg-surface border border-border text-text-secondary hover:border-primary"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Party */}
          {isGroupMode && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] text-text-secondary font-semibold">PARTY</p>
                {parties.length > 0 && (
                  <div className="flex gap-1">
                    {parties.map((party) => (
                      <button
                        key={party.id}
                        type="button"
                        onClick={() => handleSelectParty(party)}
                        className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                          selectedPartyId === party.id
                            ? "bg-primary text-white"
                            : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {party.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* Show unique users by userId */}
                {(() => {
                  const seen = new Set<string>();
                  return groupMembers.map((m) => {
                    if (seen.has(m.user_id)) return null;
                    seen.add(m.user_id);
                    const username = memberUsernames.get(m.user_id) ?? "?";
                    const isInParty = partyMemberIds.has(m.user_id);
                    return (
                      <button
                        key={`party-${m.user_id}`}
                        type="button"
                        onClick={() => togglePartyMember(m.user_id)}
                        className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                          isInParty
                            ? "bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] border border-status-available text-text-primary"
                            : "bg-surface border border-border text-text-secondary hover:border-primary"
                        }`}
                      >
                        @{username} {isInParty ? "✓" : ""}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {mvpDrops.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-text-secondary font-semibold mb-1">LOOT <span className="font-normal">(opcional)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {mvpDrops.map((drop) => {
                  const isSelected = selectedLoots.has(drop.item_id);
                  return (
                    <button
                      key={drop.item_id}
                      type="button"
                      onClick={() => toggleLoot(drop.item_id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] border border-status-available text-status-available-text"
                          : "bg-surface border border-border text-text-secondary hover:border-primary"
                      }`}
                    >
                      {drop.item_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
            </div>{/* end right column */}
          </div>{/* end two-column */}

          <div className="flex justify-between items-center pt-3 border-t border-border">
            <div>
              {isEdit && onDelete && (
                !confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={submitting}
                    className="text-xs text-status-error-text hover:opacity-80 cursor-pointer disabled:opacity-50"
                  >
                    Excluir
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={submitting}
                      className="text-xs text-white bg-status-error px-2.5 py-0.5 rounded-md hover:opacity-80 cursor-pointer disabled:opacity-50"
                    >
                      Confirmar exclusão
                    </button>
                  </div>
                )
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!timeStr || submitting}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEdit ? "Salvar" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
