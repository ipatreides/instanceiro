"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useUsernameCheck, isValidUsername } from "@/hooks/use-username-check";
import { NotificationsSection } from "@/components/profile/notifications-section";
import { CalendarSection } from "@/components/profile/calendar-section";

export default function ProfilePage() {
  const router = useRouter();
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const status = useUsernameCheck(editValue, currentUsername);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/");
        return;
      }
      supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCurrentUsername(data.username);
            setDisplayName(data.display_name);
            setAvatarUrl(data.avatar_url);
            setEditValue(data.username ?? "");
          }
          setLoading(false);
        });

      // Show success message if redirected from Discord OAuth
      const params = new URLSearchParams(window.location.search);
      if (params.get("discord") === "connected") {
        // Clean URL
        window.history.replaceState({}, "", "/profile");
      }
      if (params.get("calendar") === "connected") {
        window.history.replaceState({}, "", "/profile");
      }
    });
  }, [router]);

  async function handleSave() {
    if (status !== "available" || saving) return;
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ username: editValue })
      .eq("id", user.id);

    if (!error) {
      setCurrentUsername(editValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEditValue(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
    setSaved(false);
  }

  const hasChanged = editValue !== (currentUsername ?? "");
  const canSave = hasChanged && status === "available" && !saving;

  if (loading) {
    return <FullPageSpinner />;
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-base font-semibold text-text-primary tracking-tight">Perfil</span>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-6">
          {/* User info */}
          <div className="flex items-center gap-4">
            {avatarUrl && (
              <img src={avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
            )}
            <div>
              <p className="text-text-primary font-semibold">{displayName}</p>
              <p className="text-text-secondary text-sm">@{currentUsername ?? "sem username"}</p>
            </div>
          </div>

          {/* Username edit */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-secondary">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">@</span>
              <input
                type="text"
                value={editValue}
                onChange={handleChange}
                maxLength={20}
                className="w-full bg-surface border border-border rounded-md pl-8 pr-10 py-2.5 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                {status === "checking" && <span className="text-text-secondary animate-pulse">...</span>}
                {status === "available" && hasChanged && <span className="text-status-available">✓</span>}
                {status === "taken" && <span className="text-status-error">✗</span>}
                {status === "invalid" && editValue.length > 0 && <span className="text-status-error">✗</span>}
              </span>
            </div>
            <div className="h-5">
              {status === "taken" && <p className="text-xs text-status-error">Esse username já está em uso.</p>}
              {status === "invalid" && editValue.length > 0 && (
                <p className="text-xs text-status-error">
                  {editValue.length < 3 ? "Mínimo 3 caracteres." : "Apenas letras minúsculas e números."}
                </p>
              )}
              {saved && <p className="text-xs text-status-available">Salvo!</p>}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-2.5 rounded-md bg-primary text-text-primary font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors cursor-pointer"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        <div className="mt-6">
          <NotificationsSection />
        </div>
        <div className="mt-6">
          <CalendarSection />
        </div>
      </main>
    </div>
  );
}
