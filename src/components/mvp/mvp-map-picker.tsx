"use client";

import { useRef, useCallback } from "react";
import type { MvpMapMeta } from "@/lib/types";

interface MvpSightingPoint {
  x: number;
  y: number;
  spotted_at: string;
}

interface MvpMapPickerProps {
  mapName: string;
  mapMeta: MvpMapMeta | undefined;
  tombX: number | null;
  tombY: number | null;
  onCoordsChange: (x: number | null, y: number | null) => void;
  readOnly?: boolean;
  heatmapPoints?: { x: number; y: number }[];
  sighting?: MvpSightingPoint | null;
}

export function MvpMapPicker({ mapName, mapMeta, tombX, tombY, onCoordsChange, readOnly, heatmapPoints, sighting }: MvpMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !mapMeta || !containerRef.current) return;
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
      className={`relative aspect-square w-full rounded-lg border border-border overflow-hidden bg-bg ${readOnly ? "cursor-default" : "cursor-crosshair"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/maps/${mapName}.png`}
        alt={mapName}
        className="w-full h-full object-cover"
        draggable={false}
      />
      {/* Heatmap: historical kill locations */}
      {heatmapPoints && mapMeta && heatmapPoints.map((p, i) => (
        <div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${(p.x / mapMeta.width) * 100}%`,
            top: `${((mapMeta.height - p.y) / mapMeta.height) * 100}%`,
            backgroundColor: "var(--status-error)",
            opacity: 0.25,
          }}
        />
      ))}
      {/* MVP sighting: live position (green pulsing dot) */}
      {sighting && mapMeta && (
        <div
          className="absolute w-4 h-4 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-pulse"
          style={{
            left: `${(sighting.x / mapMeta.width) * 100}%`,
            top: `${((mapMeta.height - sighting.y) / mapMeta.height) * 100}%`,
            backgroundColor: "var(--status-available)",
            border: "2px solid var(--status-available-text)",
            boxShadow: "0 0 12px color-mix(in srgb, var(--status-available) 60%, transparent)",
          }}
          title={`MVP visto aqui — ${new Date(sighting.spotted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        />
      )}
      {/* Current tomb position */}
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
      {!readOnly && (
        <>
          <span className="absolute bottom-1 left-2 text-[9px] text-text-secondary pointer-events-none">
            {mapName}
          </span>
          {!tombX && !tombY && (
            <span className="absolute bottom-1 right-2 text-[9px] text-text-secondary pointer-events-none">
              Clique para marcar
            </span>
          )}
        </>
      )}
    </div>
  );
}
