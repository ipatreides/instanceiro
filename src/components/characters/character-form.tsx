"use client";

import { useState } from "react";
import { CLASS_TREE, buildClassPath, ClassNode } from "@/lib/class-tree";

interface CharacterFormProps {
  onSubmit: (data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => void | Promise<void>;
  onCancel?: () => void;
  initialValues?: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  };
  submitLabel?: string;
}

/**
 * Given a base class node and a level, return the classes at the appropriate tier.
 * Depth 0 = base, 1 = 2nd, 2 = transcendent, 3 = 3rd, 4 = 4th
 *
 * Level ranges:
 *   1-99  → show depth 0 (base) + depth 1 (2nd) + depth 2 (transcendent)
 *   100-199 → show depth 3 (3rd class)
 *   100-200 → show depth 2 (3rd class)
 */
function getClassesForLevel(baseNode: ClassNode, level: number): ClassNode[] {
  // Collect all nodes at each depth under this base
  const byDepth: ClassNode[][] = [];

  function collect(nodes: ClassNode[], depth: number) {
    if (!byDepth[depth]) byDepth[depth] = [];
    for (const node of nodes) {
      byDepth[depth].push(node);
      if (node.children) collect(node.children, depth + 1);
    }
  }

  if (baseNode.children) {
    collect(baseNode.children, 0);
  }

  // No children (e.g., Summoner) — the base itself is the class
  if (byDepth.length === 0) return [baseNode];

  let targetDepths: number[];
  if (level >= 100) {
    targetDepths = [2]; // 3rd class
  } else {
    targetDepths = [0, 1]; // 2nd class + transcendent
  }

  // Try target depths, fallback to deepest available
  for (const d of targetDepths) {
    if (byDepth[d] && byDepth[d].length > 0) {
      // If multiple target depths, merge them
      const result = targetDepths.flatMap((td) => byDepth[td] ?? []);
      // Deduplicate
      const seen = new Set<string>();
      return result.filter((n) => {
        if (seen.has(n.name)) return false;
        seen.add(n.name);
        return true;
      });
    }
  }

  // Fallback: return deepest available
  for (let i = byDepth.length - 1; i >= 0; i--) {
    if (byDepth[i] && byDepth[i].length > 0) return byDepth[i];
  }

  return [baseNode];
}

function getTierLabel(level: number): string {
  if (level >= 100) return "3ª Classe";
  return "2ª Classe / Transcendente";
}

export function CharacterForm({ onSubmit, onCancel, initialValues, submitLabel }: CharacterFormProps) {
  // Derive initial base class from class_path
  const initialBase = initialValues?.class_path?.[0] ?? null;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [level, setLevel] = useState(initialValues?.level ?? 200);
  const [selectedBase, setSelectedBase] = useState<string | null>(initialBase);
  const [selectedClass, setSelectedClass] = useState<string | null>(initialValues?.class_name ?? null);
  const [submitting, setSubmitting] = useState(false);

  const baseNode = CLASS_TREE.find((n) => n.name === selectedBase) ?? null;

  // When base or level changes, check if selected class is still valid
  const availableClasses = baseNode ? getClassesForLevel(baseNode, level) : [];
  const isClassStillValid = selectedClass && availableClasses.some((n) => n.name === selectedClass);
  const effectiveClass = isClassStillValid ? selectedClass : null;

  // Auto-select if only one option
  const autoClass = availableClasses.length === 1 ? availableClasses[0].name : null;
  const finalClass = effectiveClass ?? autoClass;

  const classPath = finalClass ? buildClassPath(finalClass) ?? [] : [];
  const isFormValid = name.trim().length > 0 && finalClass !== null;

  function handleSelectBase(node: ClassNode) {
    setSelectedBase(node.name);
    setSelectedClass(null);
    // If base has no children (Summoner), auto-select
  }

  function handleSelectClass(node: ClassNode) {
    setSelectedClass(node.name);
  }

  function handleLevelChange(newLevel: number) {
    setLevel(newLevel);
    // Reset class selection when tier changes
    setSelectedClass(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid || !finalClass || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        class_name: finalClass,
        class_path: classPath,
        level,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#A89BC2]">
          Nome do Personagem
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do personagem"
          maxLength={24}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-2 text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
        />
      </div>

      {/* Level */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#A89BC2]">
          Nível <span className="text-[#6B5A8A] font-normal">(1–200)</span>
        </label>
        <input
          type="number"
          value={level}
          min={1}
          max={200}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) handleLevelChange(Math.min(200, Math.max(1, v)));
          }}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-2 text-white w-28 focus:outline-none focus:border-[#7C3AED] transition-colors"
        />
      </div>

      {/* Class selector */}
      <div className="flex flex-col gap-3">
        {/* Step 1: Base class */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#6B5A8A] uppercase tracking-wide">Classe Base</span>
          <div className="grid grid-cols-5 gap-2">
            {CLASS_TREE.map((node) => (
              <button
                key={node.name}
                type="button"
                onClick={() => handleSelectBase(node)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer text-center ${
                  selectedBase === node.name
                    ? "bg-[#7C3AED] border-[#6D28D9] text-white"
                    : "bg-[#2a1f40] border-[#3D2A5C] text-[#A89BC2] hover:border-[#6D28D9] hover:text-white"
                }`}
              >
                {node.name}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Final class based on level */}
        {selectedBase && availableClasses.length > 1 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#6B5A8A] uppercase tracking-wide">
              {getTierLabel(level)}
            </span>
            <div className="flex flex-wrap gap-2">
              {availableClasses.map((node) => (
                <button
                  key={node.name}
                  type="button"
                  onClick={() => handleSelectClass(node)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                    finalClass === node.name
                      ? "bg-[#7C3AED] border-[#6D28D9] text-white"
                      : "bg-[#2a1f40] border-[#3D2A5C] text-[#A89BC2] hover:border-[#6D28D9] hover:text-white"
                  }`}
                >
                  {node.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirmation */}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={!isFormValid || submitting}
          className="flex-1 py-2 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
        >
          {submitting ? "Salvando..." : (submitLabel ?? "Criar Personagem")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md bg-[#2a1f40] border border-[#3D2A5C] text-[#A89BC2] text-sm font-medium hover:text-white hover:border-[#6D28D9] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        )}
      </div>

    </form>
  );
}
