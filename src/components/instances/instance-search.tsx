"use client";

import { useState, useRef, useEffect } from "react";

export interface SearchFilter {
  type: "map" | "liga";
  value: string;
  label: string;
}

export interface Suggestion {
  label: string;
  value: string;
  type: "map" | "liga";
}

interface InstanceSearchProps {
  text: string;
  filters: SearchFilter[];
  onTextChange: (text: string) => void;
  onAddFilter: (filter: SearchFilter) => void;
  onRemoveFilter: (index: number) => void;
  suggestions?: Suggestion[];
  placeholder?: string;
}

const FILTER_STYLES: Record<string, string> = {
  map: "text-[#D4A843] bg-[#D4A843]/20",
  liga: "text-amber-400 bg-amber-900/30",
};

export function InstanceSearch({
  text,
  filters,
  onTextChange,
  onAddFilter,
  onRemoveFilter,
  suggestions = [],
  placeholder = "Buscar instância, mapa ou liga...",
}: InstanceSearchProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Filter out already-selected suggestions
  const activeValues = new Set(filters.map((f) => `${f.type}:${f.value}`));
  const trimmed = text.trim().toLowerCase();
  const matchingSuggestions = trimmed.length >= 1
    ? suggestions.filter(
        (s) =>
          s.label.toLowerCase().includes(trimmed) &&
          !activeValues.has(`${s.type}:${s.value}`)
      )
    : [];

  function handleSelectSuggestion(s: Suggestion) {
    onAddFilter({ type: s.type, value: s.value, label: s.label });
    onTextChange("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Backspace" && text === "" && filters.length > 0) {
      onRemoveFilter(filters.length - 1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-1.5 flex-wrap bg-[#1a1230] border border-[#3D2A5C] rounded-md px-3 py-1.5 focus-within:border-[#7C3AED] transition-colors cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Search icon */}
        <svg
          className="w-4 h-4 text-[#A89BC2] flex-shrink-0"
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

        {/* Active filter tags */}
        {filters.map((f, i) => (
          <span
            key={`${f.type}-${f.value}`}
            className={`text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1 ${FILTER_STYLES[f.type]}`}
          >
            {f.label}
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveFilter(i); }}
              className="hover:opacity-70 cursor-pointer"
            >
              ×
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => { onTextChange(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={filters.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[100px] bg-transparent text-sm text-white placeholder-[#6B5A8A] focus:outline-none py-0.5"
        />

        {/* Clear all */}
        {(text.length > 0 || filters.length > 0) && (
          <button
            onClick={() => { onTextChange(""); for (let i = filters.length - 1; i >= 0; i--) onRemoveFilter(i); }}
            className="text-[#A89BC2] hover:text-white transition-colors cursor-pointer flex-shrink-0"
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
              key={`${s.type}-${s.value}`}
              onClick={() => handleSelectSuggestion(s)}
              className="w-full text-left px-3 py-2 text-sm text-[#A89BC2] hover:bg-[#2a1f40] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
            >
              <span className={`text-xs px-1.5 py-0.5 rounded ${FILTER_STYLES[s.type]}`}>
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
