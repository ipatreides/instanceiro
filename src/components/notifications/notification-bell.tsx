"use client";

import { useState, useEffect, useRef } from "react";
import type { AppNotification } from "@/lib/types";
import { NotificationItem } from "./notification-item";

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  onRespond: (notificationId: string, accepted: boolean) => Promise<void>;
}

export function NotificationBell({ notifications, unreadCount, onRespond }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pending = notifications.filter((n) => !n.responded);
  const responded = notifications.filter((n) => n.responded).slice(0, 5);
  const sorted = [...pending, ...responded];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative text-[#A89BC2] hover:text-white transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1230] border border-[#3D2A5C] rounded-lg shadow-xl z-50">
          <div className="px-3 py-2 border-b border-[#3D2A5C]">
            <span className="text-sm font-medium text-white">Notificações</span>
          </div>

          {sorted.length === 0 ? (
            <div className="px-3 py-4 text-sm text-[#6B5A8A] italic text-center">
              Nenhuma notificação
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-[#3D2A5C]/50">
              {sorted.map((n) => (
                <NotificationItem key={n.id} notification={n} onRespond={onRespond} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
