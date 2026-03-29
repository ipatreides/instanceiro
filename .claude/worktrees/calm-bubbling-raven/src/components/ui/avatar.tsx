"use client";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-7 h-7 text-xs",
  md: "w-10 h-10 text-base",
  lg: "w-20 h-20 text-2xl",
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const sizeClass = SIZES[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? "Avatar"}
        className={`rounded-full object-cover flex-shrink-0 ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <div className={`rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold flex-shrink-0 ${sizeClass} ${className}`}>
      {getInitials(name)}
    </div>
  );
}
