"use client";

import { useState, useEffect } from "react";
import { DateTimePicker } from "@/components/ui/datetime-picker";

interface ScheduleFormProps {
  minDate?: string;
  initialTime?: string; // ISO string for editing existing schedule
  onSubmit: (scheduledAt: string, message?: string) => void | Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  submitLabel?: string;
}

export function ScheduleForm({ minDate, initialTime, onSubmit, onCancel, onDirtyChange, submitLabel }: ScheduleFormProps) {
  const [scheduledTime, setScheduledTime] = useState(initialTime ?? "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isDirty = scheduledTime !== (initialTime ?? "") || message.trim().length > 0;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledTime) return;
    setLoading(true);
    try {
      await onSubmit(scheduledTime, message.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DateTimePicker
        value={scheduledTime}
        onChange={setScheduledTime}
        minDate={minDate ? new Date(minDate) : undefined}
        label="Quando?"
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6B5A8A]">Mensagem (opcional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mensagem para o grupo..."
          disabled={loading}
          rows={2}
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
          {loading ? "Salvando..." : (submitLabel ?? "Agendar")}
        </button>
      </div>
    </form>
  );
}
