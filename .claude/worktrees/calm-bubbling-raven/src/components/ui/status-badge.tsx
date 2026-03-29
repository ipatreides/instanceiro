type Status = "available" | "soon" | "cooldown" | "error";

const BADGE_STYLES: Record<Status, string> = {
  available: "bg-[color-mix(in_srgb,var(--status-available)_12%,transparent)] text-status-available-text",
  soon: "bg-[color-mix(in_srgb,var(--status-soon)_12%,transparent)] text-status-soon-text",
  cooldown: "bg-[color-mix(in_srgb,var(--status-cooldown)_12%,transparent)] text-status-cooldown-text",
  error: "bg-[color-mix(in_srgb,var(--status-error)_12%,transparent)] text-status-error-text",
};

const LABELS: Record<Status, string> = {
  available: "Disponível",
  soon: "Quase lá",
  cooldown: "Cooldown",
  error: "Erro",
};

interface StatusBadgeProps {
  status: Status;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] ${BADGE_STYLES[status]} ${className ?? ""}`}>
      {label ?? LABELS[status]}
    </span>
  );
}
