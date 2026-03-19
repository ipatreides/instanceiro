"use client";

import { useState, useRef, useEffect } from "react";

interface Suggestion {
  label: string;
  value: string;
  type: "map" | "liga";
}

interface InstanceSearchProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: Suggestion[];
  placeholder?: string;
}

export function InstanceSearch({ value, onChange, suggestions = [], placeholder = "Buscar instância, mapa ou liga..." }: InstanceSearchProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isFilterMode = value.startsWith("map:") || value.startsWith("liga:");
  const filterLabel = value.startsWith("map:") ? value.slice(4) : value.startsWith("liga:") ? `Liga ${value.slice(5)}` : "";
  const filterColor = value.startsWith("map:") ? "text-[#D4A843] bg-[#D4A843]/20" : "text-amber-400 bg-amber-900/30";

  // Filter suggestions (only when not already in filter mode)
  const trimmed = value.trim().toLowerCase();
  const matchingSuggestions = !isFilterMode && trimmed.length >= 1
    ? suggestions.filter((s) => s.label.toLowerCase().includes(trimmed))
    : [];

  function handleInputChange(text: string) {
    onChange(text);
    setShowSuggestions(true);
  }

  function handleSelectSuggestion(suggestion: Suggestion) {
    onChange(suggestion.value);
    setShowSuggestions(false);
  }

  function handleClear() {
    onChange("");
    setShowSuggestions(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        {/* Search icon */}
        <svg
          className="absolute left-3 w-4 h-4 text-[#A89BC2] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.75 6.75a7.5 7.5 0 0 0 10.6 10.6z"
          />
        </svg>

        {/* Filter tag */}
        {isFilterMode ? (
          <div className="w-full bg-[#1a1230] border border-[#3D2A5C] rounded-md pl-9 pr-9 py-2 flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${filterColor}`}>
              {filterLabel}
            </span>
          </div>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            placeholder={placeholder}
            className="w-full bg-[#1a1230] border border-[#3D2A5C] rounded-md pl-9 pr-9 py-2 text-sm text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
          />
        )}

        {/* Clear button */}
        {value.length > 0 && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 text-[#A89BC2] hover:text-white transition-colors cursor-pointer leading-none"
            aria-label="Limpar busca"
          >
            <svg
              className="w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && matchingSuggestions.length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-[#1a1230] border border-[#3D2A5C] rounded-md shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {matchingSuggestions.map((s) => (
            <button
              key={s.value}
              onClick={() => handleSelectSuggestion(s)}
              className="w-full text-left px-3 py-2 text-sm text-[#A89BC2] hover:bg-[#2a1f40] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
            >
              <span className={`text-xs px-1.5 py-0.5 rounded ${s.type === "map" ? "text-[#D4A843] bg-[#D4A843]/20" : "text-amber-400 bg-amber-900/30"}`}>
                {s.type === "map" ? "Mapa" : "Liga"}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
