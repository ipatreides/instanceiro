"use client";

interface InstanceSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function InstanceSearch({ value, onChange, placeholder = "Buscar instância..." }: InstanceSearchProps) {
  return (
    <div className="relative flex items-center">
      {/* Search icon */}
      <svg
        className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none"
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

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#1a1a2e] border border-gray-700 rounded-md pl-9 pr-9 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
      />

      {/* Clear button */}
      {value.length > 0 && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 text-gray-400 hover:text-white transition-colors cursor-pointer leading-none"
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
  );
}
