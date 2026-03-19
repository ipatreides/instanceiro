"use client";

import { Instance } from "@/lib/types";

interface LocalCharacter {
  name: string;
  class_name: string;
  class_path: string[];
  level: number;
}

interface StepLastCompletionProps {
  characters: LocalCharacter[];
  instances: Instance[];
  selectedInstances: Map<number, Set<number>>;
  lastCompletions: Map<string, string>;
  onSetCompletion: (key: string, value: string) => void;
  onFinish: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function StepLastCompletion({
  characters,
  instances,
  selectedInstances,
  lastCompletions,
  onSetCompletion,
  onFinish,
  onBack,
  isSubmitting,
}: StepLastCompletionProps) {
  // Build flat list of (charIdx, instance) pairs for selected instances
  const activeEntries: { charIdx: number; instance: Instance }[] = [];
  for (let charIdx = 0; charIdx < characters.length; charIdx++) {
    const selected = selectedInstances.get(charIdx) ?? new Set<number>();
    for (const instanceId of selected) {
      const instance = instances.find((i) => i.id === instanceId);
      if (instance) {
        activeEntries.push({ charIdx, instance });
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white">Último Completamento</h2>
        <p className="text-gray-400 text-sm mt-1">
          Informe quando cada instância foi completada pela última vez. Os horários são tratados como BRT (UTC-3). Deixe em branco se ainda não completou.
        </p>
      </div>

      {activeEntries.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          Nenhuma instância selecionada.
        </p>
      ) : (
        <div className="flex flex-col gap-4 max-h-[420px] overflow-y-auto pr-1">
          {characters.map((char, charIdx) => {
            const charEntries = activeEntries.filter(
              (e) => e.charIdx === charIdx
            );
            if (charEntries.length === 0) return null;

            return (
              <div key={charIdx}>
                {characters.length > 1 && (
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">
                    {char.name}
                  </h3>
                )}
                <div className="flex flex-col gap-2">
                  {charEntries.map(({ instance }) => {
                    const key = `${charIdx}-${instance.id}`;
                    const value = lastCompletions.get(key) ?? "";
                    const isHourly = instance.cooldown_type === "hourly";

                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 bg-[#1a1a2e] border border-gray-700 rounded-md px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm font-medium block truncate">
                            {instance.name}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {isHourly ? "Horário" : instance.cooldown_type === "daily" ? "Diário" : instance.cooldown_type === "three_day" ? "3 Dias" : "Semanal"}
                          </span>
                        </div>
                        <input
                          type={isHourly ? "datetime-local" : "date"}
                          value={value}
                          max={isHourly ? new Date().toISOString().slice(0, 16) : new Date().toISOString().slice(0, 10)}
                          onChange={(e) => onSetCompletion(key, e.target.value)}
                          className="bg-[#2a2a3e] border border-gray-600 rounded-md px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-2 rounded-md bg-[#2a2a3e] border border-gray-600 text-gray-300 font-semibold text-sm hover:text-white hover:border-gray-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Voltar
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={isSubmitting}
          className="px-6 py-2 rounded-md bg-green-600 text-white font-semibold text-sm hover:bg-green-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Salvando…" : "Concluir"}
        </button>
      </div>
      <p className="text-xs text-gray-600 text-center mt-2">
        Seus dados são preservados ao voltar.
      </p>
    </div>
  );
}
