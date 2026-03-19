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
        <p className="text-gray-400 text-sm mt-1">
          Adicione os personagens que você quer acompanhar.
        </p>
      </div>

      {/* Character list */}
      {characters.length > 0 && (
        <ul className="flex flex-col gap-2">
          {characters.map((char, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between bg-[#1a1a2e] border border-gray-700 rounded-md px-4 py-3"
            >
              <div>
                <span className="text-white font-medium">{char.name}</span>
                <span className="text-gray-400 text-sm ml-2">
                  {char.class_name} · Nv. {char.level}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveCharacter(idx)}
                className="text-gray-500 hover:text-red-400 transition-colors text-sm cursor-pointer"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Form or add button */}
      {showForm ? (
        <div className="bg-[#1a1a2e] border border-gray-700 rounded-md p-4">
          <CharacterForm
            onSubmit={handleFormSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors text-sm cursor-pointer w-full justify-center"
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
          className="px-6 py-2 rounded-md bg-blue-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}
