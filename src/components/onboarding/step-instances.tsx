"use client";

import { useState } from "react";
import { Instance, CooldownType } from "@/lib/types";

interface LocalCharacter {
  name: string;
  class_name: string;
  class_path: string[];
  level: number;
}

interface StepInstancesProps {
  characters: LocalCharacter[];
  instances: Instance[];
  selectedInstances: Map<number, Set<number>>;
  onToggle: (charIndex: number, instanceId: number) => void;
  onSelectAll: (charIndex: number) => void;
  onDeselectAll: (charIndex: number) => void;
  onNext: () => void;
  onBack: () => void;
}

const COOLDOWN_ORDER: Record<CooldownType, number> = {
  weekly: 0,
  three_day: 1,
  daily: 2,
  hourly: 3,
};

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

export function StepInstances({
  characters,
  instances,
  selectedInstances,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onNext,
  onBack,
}: StepInstancesProps) {
  const [activeCharIdx, setActiveCharIdx] = useState(0);

  const char = characters[activeCharIdx];
  const eligibleInstances = instances.filter(
    (inst) => inst.level_required <= char.level
  );

  // Group by cooldown type, sorted by COOLDOWN_ORDER
  const grouped = new Map<CooldownType, Instance[]>();
  for (const inst of eligibleInstances) {
    const ct = inst.cooldown_type;
    if (!grouped.has(ct)) grouped.set(ct, []);
    grouped.get(ct)!.push(inst);
  }
  const sortedGroups = Array.from(grouped.entries()).sort(
    ([a], [b]) => COOLDOWN_ORDER[a] - COOLDOWN_ORDER[b]
  );

  const selected = selectedInstances.get(activeCharIdx) ?? new Set<number>();
  const totalEligible = eligibleInstances.length;
  const totalSelected = selected.size;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white">Instâncias Ativas</h2>
        <p className="text-gray-400 text-sm mt-1">
          Selecione quais instâncias cada personagem faz.
        </p>
      </div>

      {/* Character tabs */}
      {characters.length > 1 && (
        <div className="flex gap-2 border-b border-gray-700 pb-0 -mb-3">
          {characters.map((c, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveCharIdx(idx)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors cursor-pointer ${
                activeCharIdx === idx
                  ? "border-blue-500 text-white bg-[#1a1a2e]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Counter + select/deselect all */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          <span className="text-white font-medium">{totalSelected}</span>
          {" / "}
          {totalEligible} selecionadas
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSelectAll(activeCharIdx)}
            className="text-xs px-3 py-1 rounded bg-[#2a2a3e] border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors cursor-pointer"
          >
            Selecionar todas
          </button>
          <button
            type="button"
            onClick={() => onDeselectAll(activeCharIdx)}
            className="text-xs px-3 py-1 rounded bg-[#2a2a3e] border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors cursor-pointer"
          >
            Desmarcar todas
          </button>
        </div>
      </div>

      {/* Instance groups */}
      <div className="flex flex-col gap-5 max-h-[400px] overflow-y-auto pr-1">
        {sortedGroups.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            Nenhuma instância disponível para o nível {char.level}.
          </p>
        ) : (
          sortedGroups.map(([cooldownType, insts]) => (
            <div key={cooldownType}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {COOLDOWN_LABELS[cooldownType]}
              </h3>
              <div className="flex flex-col gap-1">
                {insts.map((inst) => {
                  const isChecked = selected.has(inst.id);
                  return (
                    <label
                      key={inst.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#1a1a2e] border border-gray-700 hover:border-gray-500 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(activeCharIdx, inst.id)}
                        className="w-4 h-4 accent-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">
                          {inst.name}
                        </span>
                        {inst.level_required > 1 && (
                          <span className="text-gray-500 text-xs ml-2">
                            Nv. {inst.level_required}+
                          </span>
                        )}
                      </div>
                      {inst.reward && (
                        <span className="text-gray-500 text-xs truncate max-w-[120px]">
                          {inst.reward}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2 rounded-md bg-[#2a2a3e] border border-gray-600 text-gray-300 font-semibold text-sm hover:text-white hover:border-gray-400 transition-colors cursor-pointer"
        >
          ← Voltar
        </button>
        <button
          type="button"
          onClick={onNext}
          className="px-6 py-2 rounded-md bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}
