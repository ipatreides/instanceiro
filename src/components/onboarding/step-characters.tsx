"use client";

import { useState } from "react";
import { CharacterForm } from "@/components/characters/character-form";

interface LocalCharacter {
  name: string;
  class_name: string;
  class_path: string[];
  level: number;
}

interface StepCharactersProps {
  characters: LocalCharacter[];
  onAddCharacter: (data: LocalCharacter) => void;
  onRemoveCharacter: (index: number) => void;
  onNext: () => void;
}

export function StepCharacters({
  characters,
  onAddCharacter,
  onRemoveCharacter,
  onNext,
}: StepCharactersProps) {
  const [showForm, setShowForm] = useState(false);

  function handleFormSubmit(data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) {
    onAddCharacter(data);
    setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white">Seus Personagens</h2>
        <p className="text-[#A89BC2] text-sm mt-1">
          Adicione os personagens que você quer acompanhar.
        </p>
      </div>

      {/* Character list */}
      {characters.length > 0 && (
        <ul className="flex flex-col gap-2">
          {characters.map((char, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between bg-[#1a1230] border border-[#3D2A5C] rounded-md px-4 py-3"
            >
              <div>
                <span className="text-white font-medium">{char.name}</span>
                <span className="text-[#A89BC2] text-sm ml-2">
                  {char.class_name} · Nv. {char.level}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveCharacter(idx)}
                className="text-[#6B5A8A] hover:text-red-400 transition-colors text-sm cursor-pointer"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Form or add button */}
      {showForm ? (
        <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-md p-4">
          <CharacterForm
            onSubmit={handleFormSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-[#3D2A5C] text-[#A89BC2] hover:border-[#7C3AED] hover:text-[#9B6DFF] transition-colors text-sm cursor-pointer w-full justify-center"
        >
          + Adicionar Personagem
        </button>
      )}

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={characters.length === 0}
          className="px-6 py-2 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}
