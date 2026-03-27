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
  onConfirm: (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
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
  onConfirm,
  onDelete,
  onClose,
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
    existingKill?.killer_character_id ?? (isGroupMode ? null : selectedCharId)
  );

  const mvpDrops = drops.filter((d) => d.mvp_monster_id === mvp.monster_id);
  const [selectedLoots, setSelectedLoots] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

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
        tombX,
        tombY,
        killerCharacterId: killerId,
        selectedLoots: [...selectedLoots].map((itemId) => {
          const drop = mvpDrops.find((d) => d.item_id === itemId);
          return { itemId, itemName: drop?.item_name ?? `Item #${itemId}` };
        }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const charMap = new Map(characters.map((c) => [c.id, c]));

  const killerCandidates = isGroupMode
    ? groupMembers.map((m) => {
        const char = charMap.get(m.character_id);
        return char ? { id: char.id, name: char.name } : null;
      }).filter(Boolean) as { id: string; name: string }[]
    : selectedCharId
      ? [{ id: selectedCharId, name: charMap.get(selectedCharId)?.name ?? "?" }]
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg w-full max-w-[420px] max-h-[90vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-text-primary">{mvp.name}</h3>
              <p className="text-[11px] text-text-secondary">
                {mvp.map_name} · Respawn: {formatRespawn(mvp.respawn_ms)}
              </p>
            </div>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg cursor-pointer">×</button>
          </div>

          <MvpMapPicker
            mapName={mvp.map_name}
            mapMeta={mapMeta}
            tombX={tombX}
            tombY={tombY}
            onCoordsChange={handleCoordsChange}
          />

          <div className="flex gap-2 mt-3 mb-4">
            <div className="flex-1">
              <label className="text-[9px] text-text-secondary font-semibold">HORA</label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                tabIndex={1}
                className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="w-[70px]">
              <label className="text-[9px] text-text-secondary font-semibold">X</label>
              <input
                type="number"
                value={tombX ?? ""}
                onChange={(e) => setTombX(e.target.value ? Number(e.target.value) : null)}
                tabIndex={2}
                className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="w-[70px]">
              <label className="text-[9px] text-text-secondary font-semibold">Y</label>
              <input
                type="number"
                value={tombY ?? ""}
                onChange={(e) => setTombY(e.target.value ? Number(e.target.value) : null)}
                tabIndex={3}
                className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="mb-3">
            <p className="text-[10px] text-text-secondary font-semibold mb-1">
              {isGroupMode ? "KILLER" : "EU MATEI"}
            </p>
            <div className="flex flex-wrap gap-1">
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

          {mvpDrops.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-text-secondary font-semibold mb-1">LOOT <span className="font-normal">(opcional)</span></p>
              <div className="flex flex-wrap gap-1">
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

          <div className="flex justify-between items-center pt-3 border-t border-border">
            <div>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={submitting}
                  className="text-xs text-status-error-text hover:opacity-80 cursor-pointer disabled:opacity-50"
                >
                  Excluir
                </button>
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
