"use client";

interface ServerSelectorProps {
  server: string;
  onServerChange: (server: string) => void;
}

const SERVERS = [
  { id: "freya", label: "Freya" },
  { id: "nidhogg", label: "Nidhogg" },
];

export function ServerSelector({ server, onServerChange }: ServerSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {SERVERS.map((s) => (
        <button
          key={s.id}
          onClick={() => onServerChange(s.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            server === s.id
              ? "bg-primary text-white"
              : "bg-surface text-text-secondary hover:text-text-primary border border-border"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
