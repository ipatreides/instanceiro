"use client";

import { useState } from "react";
import { useUsernameCheck, isValidUsername } from "@/hooks/use-username-check";

interface StepUsernameProps {
  initialValue?: string;
  onNext: (username: string) => void;
}

export function StepUsername({ initialValue = "", onNext }: StepUsernameProps) {
  const [value, setValue] = useState(initialValue);
  const status = useUsernameCheck(value);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  }

  const canProceed = status === "available";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-white">Escolha seu @username</h2>
        <p className="text-[#A89BC2] text-sm mt-1">
          Esse será seu identificador público no Instanceiro.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B5A8A] text-sm font-medium">@</span>
          <input
            type="text"
            value={value}
            onChange={handleChange}
            maxLength={20}
            placeholder="username"
            className="w-full bg-[#2a1f40] border border-[#3D2A5C] rounded-md pl-8 pr-10 py-2.5 text-white text-sm placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
          />
          {/* Status icon */}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
            {status === "checking" && (
              <span className="text-[#A89BC2] animate-pulse">...</span>
            )}
            {status === "available" && (
              <span className="text-green-400">✓</span>
            )}
            {status === "taken" && (
              <span className="text-red-400">✗</span>
            )}
            {status === "invalid" && value.length > 0 && (
              <span className="text-red-400">✗</span>
            )}
          </span>
        </div>

        {/* Status message */}
        <div className="h-5">
          {status === "taken" && (
            <p className="text-xs text-red-400">Esse username já está em uso.</p>
          )}
          {status === "invalid" && value.length > 0 && (
            <p className="text-xs text-red-400">
              {value.length < 3
                ? "Mínimo 3 caracteres."
                : "Apenas letras minúsculas e números."}
            </p>
          )}
          {status === "available" && (
            <p className="text-xs text-green-400">Disponível!</p>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => canProceed && onNext(value)}
          disabled={!canProceed}
          className="px-6 py-2 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}
