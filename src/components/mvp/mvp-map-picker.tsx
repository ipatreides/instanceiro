"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import simpleheat from "simpleheat";
import type { MvpMapMeta } from "@/lib/types";
import { formatTimeBRT } from "@/lib/date-brt";

const HEATMAP_OPACITY_KEY = "heatmap-opacity";
const DEFAULT_OPACITY = 0.4;

function getStoredOpacity(): number {
  if (typeof window === "undefined") return DEFAULT_OPACITY;
  const stored = localStorage.getItem(HEATMAP_OPACITY_KEY);
  if (stored != null) {
    const val = parseFloat(stored);
    if (!isNaN(val) && val >= 0 && val <= 1) return val;
  }
  return DEFAULT_OPACITY;
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<ReturnType<typeof simpleheat> | null>(null);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);

  // Load stored opacity on mount
  useEffect(() => {
    setOpacity(getStoredOpacity());
  }, []);

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
  }, [mapMeta, onCoordsChange, readOnly]);

  // Render heatmap on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !mapMeta || !heatmapPoints || heatmapPoints.length === 0) return;

    const size = container.getBoundingClientRect().width;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.getContext("2d")?.scale(dpr, dpr);

    const heat = simpleheat(canvas);
    heatRef.current = heat;

    heat.radius(15 * dpr, 20 * dpr);
    heat.gradient({
      0.2: "rgba(255, 255, 0, 0.3)",
      0.5: "orange",
      0.8: "red",
      1.0: "darkred",
    });

    const points: [number, number, number][] = heatmapPoints.map((p) => [
      (p.x / mapMeta.width) * size * dpr,
      ((mapMeta.height - p.y) / mapMeta.height) * size * dpr,
      1,
    ]);

    heat.data(points);
    heat.max(Math.max(3, Math.ceil(points.length * 0.3)));
    heat.draw(0.05);
  }, [heatmapPoints, mapMeta]);

  const handleOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOpacity(val);
    localStorage.setItem(HEATMAP_OPACITY_KEY, String(val));
  }, []);

  const dotStyle = tombX != null && tombY != null && mapMeta ? {
    left: `${(tombX / mapMeta.width) * 100}%`,
    top: `${((mapMeta.height - tombY) / mapMeta.height) * 100}%`,
  } : null;

  const hasHeatmap = heatmapPoints && heatmapPoints.length > 0;

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
      {/* Heatmap canvas overlay */}
      {hasHeatmap && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ opacity, zIndex: 1 }}
        />
      )}
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
            zIndex: 10,
          }}
          title={`MVP visto aqui — ${formatTimeBRT(sighting.spotted_at)}`}
        />
      )}
      {/* Current tomb position — hidden when MVP is alive (sighting active) */}
      {dotStyle && !sighting && (
        <div
          className="absolute w-3 h-3 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            ...dotStyle,
            backgroundColor: "var(--primary)",
            borderColor: "var(--primary-secondary)",
            boxShadow: "0 0 8px color-mix(in srgb, var(--primary) 50%, transparent)",
            zIndex: 10,
          }}
        />
      )}
      {/* Opacity slider — inside map, bottom-right */}
      {hasHeatmap && (
        <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 opacity-40 hover:opacity-100 transition-opacity" style={{ zIndex: 20, backgroundColor: "color-mix(in srgb, var(--bg) 70%, transparent)" }}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={handleOpacityChange}
            onClick={(e) => e.stopPropagation()}
            className="w-14 h-1 accent-primary cursor-pointer"
          />
        </div>
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
