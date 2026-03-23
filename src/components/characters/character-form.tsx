"use client";

import { useState, useEffect } from "react";
import { CLASS_TREE, buildClassPath, ClassNode } from "@/lib/class-tree";

interface CharacterFormProps {
  onSubmit: (data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => void | Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialValues?: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  };
  submitLabel?: string;
}

/** Get all descendant classes for a base node (flat list) */
function getAllDescendants(baseNode: ClassNode): ClassNode[] {
  const result: ClassNode[] = [];
  function collect(nodes: ClassNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children) collect(node.children);
    }
  }
  if (baseNode.children) {
    collect(baseNode.children);
  } else {
    // No children (e.g., Invocador) — the base itself is the class
    result.push(baseNode);
  }
  return result;
}

export function CharacterForm({ onSubmit, onCancel, onDirtyChange, initialValues, submitLabel }: CharacterFormProps) {
  // Derive initial base class from class_path
  const initialBase = initialValues?.class_path?.[0] ?? null;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [level, setLevel] = useState(initialValues?.level ?? 200);
  const [selectedBase, setSelectedBase] = useState<string | null>(initialBase);
  const [selectedClass, setSelectedClass] = useState<string | null>(initialValues?.class_name ?? null);
  const [submitting, setSubmitting] = useState(false);

  // Notify parent of dirty state
  const isDirty = name !== (initialValues?.name ?? "") ||
    level !== (initialValues?.level ?? 200) ||
    selectedClass !== (initialValues?.class_name ?? null);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const baseNode = CLASS_TREE.find((n) => n.name === selectedBase) ?? null;

  // Show ALL descendant classes for the selected base (no level filtering)
  const availableClasses = baseNode ? getAllDescendants(baseNode) : [];
  const isClassStillValid = selectedClass && availableClasses.some((n) => n.name === selectedClass);
  const effectiveClass = isClassStillValid ? selectedClass : null;

  // Auto-select if only one option (e.g. Invocador has no children)
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

        {/* Step 2: Pick class */}
        {selectedBase && availableClasses.length > 1 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#6B5A8A] uppercase tracking-wide">Classe</span>
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
