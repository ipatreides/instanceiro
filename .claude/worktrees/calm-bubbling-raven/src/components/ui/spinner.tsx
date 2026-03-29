export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8" }[size];
  return (
    <div className={`${sizeClass} border-2 border-primary border-t-transparent rounded-full animate-spin`} />
  );
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      {label && <p className="text-text-secondary text-sm">{label}</p>}
    </div>
  );
}
