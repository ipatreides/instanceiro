interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 32, className }: LogoIconProps) {
  if (size <= 16) {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className}>
        <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="var(--primary)" strokeWidth="8" fill="color-mix(in srgb, var(--primary) 12%, transparent)" strokeLinejoin="round" />
        <circle cx="40" cy="40" r="9" fill="var(--primary)" />
      </svg>
    );
  }

  if (size <= 32) {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className}>
        <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="var(--primary)" strokeWidth="5" fill="color-mix(in srgb, var(--primary) 12%, transparent)" strokeLinejoin="round" />
        <circle cx="40" cy="40" r="14" stroke="var(--primary-secondary)" strokeWidth="3" fill="none" />
        <line x1="40" y1="40" x2="40" y2="29" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" />
        <line x1="40" y1="40" x2="49" y2="40" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="40" cy="40" r="3.5" fill="var(--primary)" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className}>
      <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="var(--primary)" strokeWidth="4.5" fill="color-mix(in srgb, var(--primary) 10%, transparent)" strokeLinejoin="round" />
      <circle cx="40" cy="40" r="16" stroke="var(--primary-secondary)" strokeWidth="2.5" fill="none" />
      <line x1="40" y1="40" x2="40" y2="27" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="40" y1="40" x2="50" y2="40" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="40" r="3" fill="var(--primary)" />
      <line x1="40" y1="24.5" x2="40" y2="27" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
      <line x1="55.5" y1="40" x2="53" y2="40" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="55.5" x2="40" y2="53" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
      <line x1="24.5" y1="40" x2="27" y2="40" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const SIZES = { sm: 20, md: 28, lg: 48 } as const;
const TEXT_SIZES = { sm: "text-lg", md: "text-xl", lg: "text-4xl" } as const;

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  const iconSize = SIZES[size];

  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoIcon size={iconSize} />
      {showText && (
        <span className={`font-bold tracking-tight text-text-primary ${TEXT_SIZES[size]}`}>
          Instanceiro
        </span>
      )}
    </div>
  );
}
