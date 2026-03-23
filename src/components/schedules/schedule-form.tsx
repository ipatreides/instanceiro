"use client";

import { useState } from "react";
import { toBrtDatetimeLocal, fromBrtDatetimeLocal } from "@/lib/format-date";

interface ScheduleFormProps {
  minDate?: string; // ISO datetime string for min date (cooldown expiry)
  onSubmit: (scheduledAt: string, message?: string) => void | Promise<void>;
  onCancel: () => void;
}

function getMinBrt(minDate?: string): string {
  const now = new Date();
  if (minDate) {
    const min = new Date(minDate);
    return toBrtDatetimeLocal(min > now ? min : now);
  }
  return toBrtDatetimeLocal(now);
}

export function ScheduleForm({ minDate, onSubmit, onCancel }: ScheduleFormProps) {
  const [scheduledTime, setScheduledTime] = useState(() => getMinBrt(minDate));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledTime) return;
    setLoading(true);
    try {
      const isoTime = fromBrtDatetimeLocal(scheduledTime);
      await onSubmit(isoTime, message.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6B5A8A]">Data e horário (BRT)</label>
        <input
          type="datetime-local"
          value={scheduledTime}
          min={getMinBrt(minDate)}
          onChange={(e) => setScheduledTime(e.target.value)}
          required
          disabled={loading}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-[#A89BC2] focus:outline-none focus:border-[#7C3AED]"
          style={{ colorScheme: "dark" }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6B5A8A]">Mensagem (opcional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mensagem para o grupo..."
          disabled={loading}
          rows={3}
          className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-[#A89BC2] placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] resize-none"
          style={{ colorScheme: "dark" }}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !scheduledTime}
          className="px-4 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Agendando..." : "Agendar"}
        </button>
      </div>
    </form>
  );
}
