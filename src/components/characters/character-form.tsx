"use client";

import { useState, useEffect } from "react";
import { getLeafClasses, buildClassPath } from "@/lib/class-tree";

interface CharacterFormProps {
  accountId?: string;
  onSubmit: (data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
    account_id?: string;
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

const ALL_CLASSES = getLeafClasses();

export function CharacterForm({ accountId, onSubmit, onCancel, onDirtyChange, initialValues, submitLabel }: CharacterFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [level, setLevel] = useState(initialValues?.level ?? 200);
  const [classInput, setClassInput] = useState(initialValues?.class_name ?? "");
  const [submitting, setSubmitting] = useState(false);

  const isDirty = name !== (initialValues?.name ?? "") ||
    level !== (initialValues?.level ?? 200) ||
    classInput !== (initialValues?.class_name ?? "");
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const isValidClass = ALL_CLASSES.includes(classInput);
  const classPath = isValidClass ? buildClassPath(classInput) ?? [] : [];
  const isFormValid = name.trim().length > 0 && isValidClass;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        class_name: classInput,
        class_path: classPath,
        level,
        ...(accountId && { account_id: accountId }),
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

      {/* Class */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#A89BC2]">Classe</label>
        <input
          type="text"
          value={classInput}
          onChange={(e) => setClassInput(e.target.value)}
          placeholder="Digite para buscar..."
          list="class-options"
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-2 text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
        />
        <datalist id="class-options">
          {ALL_CLASSES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {classInput && !isValidClass && (
          <p className="text-xs text-red-400">Classe não encontrada</p>
        )}
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
            if (!isNaN(v)) setLevel(Math.min(200, Math.max(1, v)));
          }}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-2 text-white w-28 focus:outline-none focus:border-[#7C3AED] transition-colors"
        />
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
