"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Instance } from "@/lib/types";
import { StepCharacters } from "@/components/onboarding/step-characters";
import { StepInstances } from "@/components/onboarding/step-instances";
import { StepLastCompletion } from "@/components/onboarding/step-last-completion";

interface LocalCharacter {
  name: string;
  class_name: string;
  class_path: string[];
  level: number;
}

const STEP_LABELS = ["Personagens", "Instâncias", "Histórico"];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [characters, setCharacters] = useState<LocalCharacter[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  // Map<charIndex, Set<instanceId>>
  const [selectedInstances, setSelectedInstances] = useState<
    Map<number, Set<number>>
  >(new Map());
  // Map<"charIdx-instanceId", dateString>
  const [lastCompletions, setLastCompletions] = useState<Map<string, string>>(
    new Map()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch instances on mount
  useEffect(() => {
    async function fetchInstances() {
      const { data } = await supabase
        .from("instances")
        .select("*")
        .order("level_required", { ascending: true });
      if (data) setInstances(data as Instance[]);
    }
    fetchInstances();
  }, []);

  // --- Step 1 handlers ---
  function handleAddCharacter(data: LocalCharacter) {
    setCharacters((prev) => [...prev, data]);
  }

  function handleRemoveCharacter(index: number) {
    setCharacters((prev) => prev.filter((_, i) => i !== index));
    // Clean up selected instances for removed character
    setSelectedInstances((prev) => {
      const next = new Map(prev);
      next.delete(index);
      // Re-key: shift all indexes above `index` down by 1
      const shifted = new Map<number, Set<number>>();
      next.forEach((set, idx) => {
        shifted.set(idx > index ? idx - 1 : idx, set);
      });
      return shifted;
    });
    setLastCompletions((prev) => {
      const next = new Map<string, string>();
      prev.forEach((val, key) => {
        const [charIdxStr, instIdStr] = key.split("-");
        const charIdx = parseInt(charIdxStr, 10);
        if (charIdx === index) return;
        const newIdx = charIdx > index ? charIdx - 1 : charIdx;
        next.set(`${newIdx}-${instIdStr}`, val);
      });
      return next;
    });
  }

  // --- Step 2 handlers ---
  function handleToggle(charIndex: number, instanceId: number) {
    setSelectedInstances((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(charIndex) ?? []);
      if (set.has(instanceId)) {
        set.delete(instanceId);
      } else {
        set.add(instanceId);
      }
      next.set(charIndex, set);
      return next;
    });
  }

  function handleSelectAll(charIndex: number) {
    const char = characters[charIndex];
    const eligible = instances
      .filter((i) => i.level_required <= char.level && (!i.level_max || char.level <= i.level_max))
      .map((i) => i.id);
    setSelectedInstances((prev) => {
      const next = new Map(prev);
      next.set(charIndex, new Set(eligible));
      return next;
    });
  }

  function handleDeselectAll(charIndex: number) {
    setSelectedInstances((prev) => {
      const next = new Map(prev);
      next.set(charIndex, new Set());
      return next;
    });
  }

  // --- Step 3 handlers ---
  function handleSetCompletion(key: string, value: string) {
    setLastCompletions((prev) => {
      const next = new Map(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  // --- Final submission ---
  async function handleFinish() {
    setIsSubmitting(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Create characters, get back IDs
      const { data: createdChars, error: charError } = await supabase
        .from("characters")
        .insert(
          characters.map((c) => ({
            user_id: user.id,
            name: c.name,
            class: c.class_name,
            class_path: c.class_path,
            level: c.level,
            is_active: true,
          }))
        )
        .select("id");

      if (charError) throw charError;
      if (!createdChars) throw new Error("No characters returned");

      // 2. Create character_instances rows for all eligible instances
      const charInstanceRows: {
        character_id: string;
        instance_id: number;
        is_active: boolean;
      }[] = [];

      for (let charIdx = 0; charIdx < characters.length; charIdx++) {
        const char = characters[charIdx];
        const charId = createdChars[charIdx].id;
        const selected = selectedInstances.get(charIdx) ?? new Set<number>();
        const eligible = instances.filter(
          (i) => i.level_required <= char.level && (!i.level_max || char.level <= i.level_max)
        );

        for (const inst of eligible) {
          charInstanceRows.push({
            character_id: charId,
            instance_id: inst.id,
            is_active: selected.has(inst.id),
          });
        }
      }

      if (charInstanceRows.length > 0) {
        const { error: ciError } = await supabase
          .from("character_instances")
          .insert(charInstanceRows);
        if (ciError) throw ciError;
      }

      // 3. Create instance_completions from lastCompletions
      const completionRows: {
        character_id: string;
        instance_id: number;
        completed_at: string;
      }[] = [];

      lastCompletions.forEach((dateStr, key) => {
        if (!dateStr) return;
        const [charIdxStr, instIdStr] = key.split("-");
        const charIdx = parseInt(charIdxStr, 10);
        const instanceId = parseInt(instIdStr, 10);
        const charId = createdChars[charIdx]?.id;
        if (!charId) return;

        const instance = instances.find((i) => i.id === instanceId);
        if (!instance) return;

        let completedAt: string;
        if (instance.cooldown_type === "hourly") {
          // datetime-local value: "YYYY-MM-DDTHH:mm" — treat as BRT (-03:00)
          completedAt = `${dateStr}:00-03:00`;
        } else {
          // date-only value: "YYYY-MM-DD" — use noon BRT
          completedAt = `${dateStr}T12:00:00-03:00`;
        }

        completionRows.push({
          character_id: charId,
          instance_id: instanceId,
          completed_at: completedAt,
        });
      });

      if (completionRows.length > 0) {
        const { error: compError } = await supabase
          .from("instance_completions")
          .insert(completionRows);
        if (compError) throw compError;
      }

      // 4. Mark onboarding as completed
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
      if (profileError) throw profileError;

      // 5. Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      console.error("Onboarding submission failed:", err);
      setError("Erro ao salvar. Tente novamente.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0f0f17] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-1">
            Configuração Inicial
          </h1>
          <p className="text-gray-400 text-sm">
            Passo {step} de {STEP_LABELS.length}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-8">
          {STEP_LABELS.map((label, idx) => {
            const stepNum = idx + 1;
            const isCompleted = step > stepNum;
            const isActive = step === stepNum;
            return (
              <div key={idx} className="flex-1 flex flex-col gap-1">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    isCompleted
                      ? "bg-blue-500"
                      : isActive
                      ? "bg-blue-500"
                      : "bg-gray-700"
                  }`}
                />
                <span
                  className={`text-xs text-center ${
                    isActive ? "text-blue-400" : isCompleted ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-[#1a1a2e] border border-gray-700 rounded-xl p-6">
          {step === 1 && (
            <StepCharacters
              characters={characters}
              onAddCharacter={handleAddCharacter}
              onRemoveCharacter={handleRemoveCharacter}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepInstances
              characters={characters}
              instances={instances}
              selectedInstances={selectedInstances}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <>
              <StepLastCompletion
                characters={characters}
                instances={instances}
                selectedInstances={selectedInstances}
                lastCompletions={lastCompletions}
                onSetCompletion={handleSetCompletion}
                onFinish={handleFinish}
                onBack={() => setStep(2)}
                isSubmitting={isSubmitting}
              />
              {error && (
                <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-800 rounded-md px-3 py-2 mt-4">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
