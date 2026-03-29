"use client";

import { useState } from "react";
import type { AppNotification } from "@/lib/types";

interface NotificationItemProps {
  notification: AppNotification;
  onRespond: (notificationId: string, accepted: boolean) => Promise<void>;
}

export function NotificationItem({ notification, onRespond }: NotificationItemProps) {
  const [loading, setLoading] = useState(false);

  const payload = notification.payload as {
    party_id: string;
    instance_name: string;
    invited_by: string;
    character_id: string;
    character_name: string;
    completed_at: string;
  };

  async function handleRespond(accepted: boolean) {
    setLoading(true);
    try {
      await onRespond(notification.id, accepted);
    } finally {
      setLoading(false);
    }
  }

  if (notification.responded) {
    return (
      <div className="px-3 py-2 text-sm text-text-secondary">
        <span className="font-medium">{payload.instance_name}</span> com{" "}
        <span className="font-medium">{payload.character_name}</span>
        <span className="ml-2 text-xs italic">Respondido</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-sm">
      <p className="text-text-secondary mb-2">
        <span className="text-primary">@{payload.invited_by}</span>{" "}
        te adicionou à{" "}
        <span className="text-text-primary font-medium">{payload.instance_name}</span>
        {" "}com ele, participar?
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => handleRespond(true)}
          disabled={loading}
          className="px-3 py-1 rounded text-sm font-medium text-white bg-status-available hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Sim
        </button>
        <button
          onClick={() => handleRespond(false)}
          disabled={loading}
          className="px-3 py-1 rounded text-sm font-medium text-text-secondary bg-surface border border-border hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Não
        </button>
      </div>
    </div>
  );
}
