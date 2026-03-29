"use client";

import { useState, useEffect } from "react";
import { DateTimePicker } from "@/components/ui/datetime-picker";

interface ScheduleFormProps {
  minDate?: string;
  initialTime?: string; // ISO string for editing existing schedule
  onSubmit: (scheduledAt: string, message?: string, title?: string) => void | Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  submitLabel?: string;
  error?: string | null;
}

export function ScheduleForm({ minDate, initialTime, onSubmit, onCancel, onDirtyChange, submitLabel, error }: ScheduleFormProps) {
  const [scheduledTime, setScheduledTime] = useState(initialTime ?? "");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isDirty = scheduledTime !== (initialTime ?? "") || title.trim().length > 0 || message.trim().length > 0;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledTime) return;
    setLoading(true);
    try {
      await onSubmit(scheduledTime, message.trim() || undefined, title.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">Título (opcional)</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Farm de cartas, Guild run..."
          disabled={loading}
          maxLength={60}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <DateTimePicker
        value={scheduledTime}
        onChange={setScheduledTime}
        minDate={minDate ? new Date(minDate) : undefined}
        label="Quando?"
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">Mensagem (opcional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mensagem para o grupo..."
          disabled={loading}
          rows={2}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-secondary focus:outline-none focus:border-primary resize-none"
          style={{ colorScheme: "dark" }}
        />
      </div>

      {error && (
        <p className="text-sm text-status-error bg-status-error/10 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !scheduledTime}
          className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Salvando..." : (submitLabel ?? "Agendar")}
        </button>
      </div>
    </form>
  );
}
