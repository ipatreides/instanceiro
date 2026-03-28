import Link from "next/link";

interface PremiumBadgeProps {
  feature?: string;
}

export function PremiumBadge({ feature }: PremiumBadgeProps) {
  const href = feature ? `/premium?feature=${feature}` : "/premium";

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
    >
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zm7-10a1 1 0 01.707.293l.828.828.828-.828a1 1 0 111.414 1.414l-.828.828.828.828a1 1 0 01-1.414 1.414l-.828-.828-.828.828a1 1 0 01-1.414-1.414l.828-.828-.828-.828A1 1 0 0112 2z" clipRule="evenodd" />
      </svg>
      Premium
    </Link>
  );
}
