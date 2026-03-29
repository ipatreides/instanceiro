"use client";

import { useState, useMemo } from "react";
import { useDragScroll } from "@/hooks/use-drag-scroll";

interface DateTimePickerProps {
  value: string; // ISO string or empty
  onChange: (iso: string) => void;
  minDate?: Date;
  label?: string;
}

const HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getBrtNow(): Date {
  return new Date();
}

function formatDayLabel(date: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
}

function toIsoWithOffset(date: Date, hour: number): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00-03:00`;
}

function parseSelected(iso: string): { dayIndex: number; hour: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // Convert to BRT for display
  const brt = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return { dayIndex: -1, hour: brt.getHours() };
}

export function DateTimePicker({ value, onChange, minDate, label }: DateTimePickerProps) {
  const now = getBrtNow();

  // Generate next 7 days
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      result.push(d);
    }
    return result;
  }, [now.getFullYear(), now.getMonth(), now.getDate()]);

  // Figure out which day is selected from value
  const selectedDate = value ? new Date(value) : null;
  const selectedBrt = selectedDate
    ? new Date(selectedDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    : null;

  const drag = useDragScroll();

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    if (!selectedBrt) return 0;
    const idx = days.findIndex(
      (d) => d.getDate() === selectedBrt.getDate() && d.getMonth() === selectedBrt.getMonth()
    );
    return idx >= 0 ? idx : 0;
  });

  const selectedHour = selectedBrt ? selectedBrt.getHours() : null;
  const currentDay = days[selectedDayIndex];

  // Filter hours: if today, only show hours >= current hour
  const nowBrt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const isToday = selectedDayIndex === 0;
  const minHour = isToday ? nowBrt.getHours() : 0;
  const availableHours = HOURS.filter((h) => h >= minHour);

  function handleDayClick(index: number) {
    setSelectedDayIndex(index);
    // Keep the same hour if valid, otherwise clear
    if (selectedHour !== null && (index > 0 || selectedHour >= nowBrt.getHours())) {
      onChange(toIsoWithOffset(days[index], selectedHour));
    }
  }

  function handleHourClick(hour: number) {
    onChange(toIsoWithOffset(currentDay, hour));
  }

  return (
    <div className="flex flex-col gap-3">
      {label && <label className="text-xs text-text-secondary">{label} <span className="text-text-secondary/60">(horário de Brasília)</span></label>}

      {/* Day selector */}
      <div
        ref={drag.ref}
        {...drag.handlers}
        className="flex gap-1.5 overflow-x-auto select-none"
      >
        {days.map((day, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { if (!drag.wasDragged()) handleDayClick(i); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              selectedDayIndex === i
                ? "bg-primary text-white"
                : "bg-surface text-text-secondary border border-border hover:border-primary hover:text-text-primary"
            }`}
          >
            {formatDayLabel(day, now)}
          </button>
        ))}
      </div>

      {/* Hour grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {availableHours.map((hour) => (
          <button
            key={hour}
            type="button"
            onClick={() => handleHourClick(hour)}
            className={`py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              selectedHour === hour && selectedDayIndex === (days.findIndex(
                (d) => selectedBrt && d.getDate() === selectedBrt.getDate() && d.getMonth() === selectedBrt.getMonth()
              ))
                ? "bg-primary text-white"
                : "bg-surface text-text-secondary border border-border hover:border-primary hover:text-text-primary"
            }`}
          >
            {String(hour).padStart(2, "0")}:00
          </button>
        ))}
      </div>

      {/* Show selected datetime */}
      {value && selectedBrt && (
        <p className="text-xs text-text-secondary">
          {formatDayLabel(currentDay, now)} às {String(selectedBrt.getHours()).padStart(2, "0")}:{String(selectedBrt.getMinutes()).padStart(2, "0")} BRT
        </p>
      )}
    </div>
  );
}
