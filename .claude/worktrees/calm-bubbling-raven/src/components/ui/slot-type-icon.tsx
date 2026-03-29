import type { SlotType } from "@/lib/class-roles";
import { SLOT_TYPE_COLORS } from "@/lib/class-roles";

interface SlotTypeIconProps {
  type: SlotType;
  size?: number;
  className?: string;
}

function CrosshairIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="8" fill="none" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" fill="none" />
      <line x1="12" y1="18" x2="12" y2="22" fill="none" />
      <line x1="2" y1="12" x2="6" y2="12" fill="none" />
      <line x1="18" y1="12" x2="22" y2="12" fill="none" />
    </>
  );
}

function StarIcon() {
  return (
    <path d="M12 2 L13.5 8.5 L20 7 L15 12 L20 17 L13.5 15.5 L12 22 L10.5 15.5 L4 17 L9 12 L4 7 L10.5 8.5 Z" />
  );
}

function MusicNoteIcon() {
  return (
    <>
      <circle cx="8" cy="17" r="3" />
      <line x1="11" y1="17" x2="11" y2="4" fill="none" />
      <path d="M11 4 Q16 3 18 7 Q16 5 11 6" fill="none" />
    </>
  );
}

function ShieldIcon() {
  return (
    <path d="M12 3 L4 7 L4 14 Q4 19 12 22 Q20 19 20 14 L20 7 Z" />
  );
}

const ICON_MAP: Record<SlotType, () => React.JSX.Element> = {
  dps_fisico: CrosshairIcon,
  dps_magico: StarIcon,
  artista: MusicNoteIcon,
  class: ShieldIcon,
};

export function SlotTypeIcon({ type, size = 44, className }: SlotTypeIconProps) {
  const color = SLOT_TYPE_COLORS[type];
  const IconContent = ICON_MAP[type];
  const svgSize = Math.round(size * 0.55);

  return (
    <div
      className={`flex items-center justify-center rounded-[var(--radius-md)] ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <svg
        width={svgSize}
        height={svgSize}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          stroke: color,
          fill: color,
          fillOpacity: "var(--icon-fill-opacity)",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      >
        <IconContent />
      </svg>
    </div>
  );
}
