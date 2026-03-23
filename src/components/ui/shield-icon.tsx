type Status = "available" | "soon" | "cooldown" | "error";

const STATUS_COLORS: Record<Status, { stroke: string; fill: string }> = {
  available: { stroke: "var(--status-available)", fill: "var(--status-available)" },
  soon: { stroke: "var(--status-soon)", fill: "var(--status-soon)" },
  cooldown: { stroke: "var(--primary)", fill: "var(--primary)" },
  error: { stroke: "var(--status-error)", fill: "var(--status-error)" },
};

interface ShieldIconProps {
  status: Status;
  size?: number;
  className?: string;
}

export function ShieldIcon({ status, size = 18, className }: ShieldIconProps) {
  const { stroke, fill } = STATUS_COLORS[status];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        fill={fill}
        fillOpacity="var(--icon-fill-opacity)"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
