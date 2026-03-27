"use client";

import { useRef, useCallback } from "react";
import type { MvpMapMeta } from "@/lib/types";

interface MvpMapPickerProps {
  mapName: string;
  mapMeta: MvpMapMeta | undefined;
  tombX: number | null;
  tombY: number | null;
  onCoordsChange: (x: number | null, y: number | null) => void;
}

export function MvpMapPicker({ mapName, mapMeta, tombX, tombY, onCoordsChange }: MvpMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapMeta || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const renderedSize = rect.width;
    const gameX = Math.round(clickX * (mapMeta.width / renderedSize));
    const gameY = Math.round((renderedSize - clickY) * (mapMeta.height / renderedSize));
    onCoordsChange(
      Math.max(0, Math.min(gameX, mapMeta.width - 1)),
      Math.max(0, Math.min(gameY, mapMeta.height - 1))
    );
  }, [mapMeta, onCoordsChange]);

  const dotStyle = tombX != null && tombY != null && mapMeta ? {
    left: `${(tombX / mapMeta.width) * 100}%`,
    top: `${((mapMeta.height - tombY) / mapMeta.height) * 100}%`,
  } : null;

  return (
    <div
      ref={containerRef}
      onClick={handleMapClick}
      className="relative aspect-square w-full rounded-lg border border-border overflow-hidden cursor-crosshair bg-bg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/maps/${mapName}.png`}
        alt={mapName}
        className="w-full h-full object-cover"
        draggable={false}
      />
      {dotStyle && (
        <div
          className="absolute w-3 h-3 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            ...dotStyle,
            backgroundColor: "var(--primary)",
            borderColor: "var(--primary-secondary)",
            boxShadow: "0 0 8px color-mix(in srgb, var(--primary) 50%, transparent)",
          }}
        />
      )}
      <span className="absolute bottom-1 left-2 text-[9px] text-text-secondary pointer-events-none">
        {mapName}
      </span>
      {!tombX && !tombY && (
        <span className="absolute bottom-1 right-2 text-[9px] text-text-secondary pointer-events-none">
          Clique para marcar
        </span>
      )}
    </div>
  );
}
