"use client";

import { useState } from "react";
import { CLASS_TREE, buildClassPath, ClassNode } from "@/lib/class-tree";

interface CharacterFormProps {
  onSubmit: (data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => void;
  onCancel?: () => void;
}

export function CharacterForm({ onSubmit, onCancel }: CharacterFormProps) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(1);
  // selectedPath tracks the node chosen at each depth, e.g. ["Espadachim", "Cavaleiro"]
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  // Build the list of tiers to render.
  // Tier 0: CLASS_TREE root nodes
  // Tier N: children of the node selected at tier N-1
  const tiers: ClassNode[][] = [CLASS_TREE];
  for (const name of selectedPath) {
    const currentTier = tiers[tiers.length - 1];
    const selectedNode = currentTier.find((n) => n.name === name);
    if (selectedNode?.children && selectedNode.children.length > 0) {
      tiers.push(selectedNode.children);
    } else {
      break;
    }
  }

  // The leaf is the last selected node if it has no children (or no further selection needed)
  const lastSelectedName = selectedPath[selectedPath.length - 1] ?? null;
  const lastTierNodes = tiers[selectedPath.length] ?? null;
  const lastSelectedNode = lastTierNodes
    ? lastTierNodes.find((n) => n.name === lastSelectedName) ?? null
    : null;
  const isLeafSelected =
    lastSelectedName !== null &&
    (!lastSelectedNode?.children || lastSelectedNode.children.length === 0);

  const classPath = isLeafSelected ? buildClassPath(lastSelectedName!) ?? [] : [];
  const isFormValid = name.trim().length > 0 && isLeafSelected;

  function handleSelectClass(depth: number, node: ClassNode) {
    // Truncate the path at this depth, then set the new selection
    const newPath = [...selectedPath.slice(0, depth), node.name];
    setSelectedPath(newPath);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    onSubmit({
      name: name.trim(),
      class_name: lastSelectedName!,
      class_path: classPath,
      level,
    });
  }

  const tierLabels = [
    "Classe Base",
    "2ª Classe",
    "Transcendente",
    "3ª Classe",
    "4ª Classe",
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-300">
          Nome do Personagem
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do personagem"
          maxLength={24}
          className="bg-[#2a2a3e] border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Level */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-300">
          Nível <span className="text-gray-500 font-normal">(1–250)</span>
        </label>
        <input
          type="number"
          value={level}
          min={1}
          max={250}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setLevel(Math.min(250, Math.max(1, v)));
          }}
          className="bg-[#2a2a3e] border border-gray-600 rounded-md px-3 py-2 text-white w-28 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Class selector */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-gray-300">Classe</span>

        {tiers.map((tierNodes, depth) => {
          // Only render up to the depth where we still have selections feeding the next tier,
          // plus one more (the next chooseable tier).
          // selectedPath[depth] is what was chosen at this depth.
          const chosenAtDepth = selectedPath[depth] ?? null;

          return (
            <div key={depth} className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                {tierLabels[depth] ?? `Tier ${depth + 1}`}
              </span>
              <div className="flex flex-wrap gap-2">
                {tierNodes.map((node) => {
                  const isSelected = chosenAtDepth === node.name;
                  return (
                    <button
                      key={node.name}
                      type="button"
                      onClick={() => handleSelectClass(depth, node)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-[#2a2a3e] border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white"
                      }`}
                    >
                      {node.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Leaf confirmation */}
        {isLeafSelected && classPath.length > 0 && (
          <p className="text-green-400 text-sm font-medium mt-1">
            Classe selecionada: {classPath.join(" → ")}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={!isFormValid}
          className="flex-1 py-2 rounded-md bg-blue-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Criar Personagem
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md bg-[#2a2a3e] border border-gray-600 text-gray-300 text-sm font-medium hover:text-white hover:border-gray-400 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
