"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useUsernameCheck, isValidUsername } from "@/hooks/use-username-check";

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
    <div className="min-h-screen bg-[#0f0a1a]">
      {/* Header */}
      <header className="bg-[#1a1230] border-b border-[#3D2A5C] sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-base font-semibold text-white tracking-tight">Perfil</span>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-[#A89BC2] hover:text-white transition-colors cursor-pointer"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-xl p-6 flex flex-col gap-6">
          {/* User info */}
          <div className="flex items-center gap-4">
            {avatarUrl && (
              <img src={avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
            )}
            <div>
              <p className="text-white font-semibold">{displayName}</p>
              <p className="text-[#A89BC2] text-sm">@{currentUsername ?? "sem username"}</p>
            </div>
          </div>

          {/* Username edit */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#A89BC2]">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B5A8A] text-sm font-medium">@</span>
              <input
                type="text"
                value={editValue}
                onChange={handleChange}
                maxLength={20}
                className="w-full bg-[#2a1f40] border border-[#3D2A5C] rounded-md pl-8 pr-10 py-2.5 text-white text-sm placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                {status === "checking" && <span className="text-[#A89BC2] animate-pulse">...</span>}
                {status === "available" && hasChanged && <span className="text-green-400">✓</span>}
                {status === "taken" && <span className="text-red-400">✗</span>}
                {status === "invalid" && editValue.length > 0 && <span className="text-red-400">✗</span>}
              </span>
            </div>
            <div className="h-5">
              {status === "taken" && <p className="text-xs text-red-400">Esse username já está em uso.</p>}
              {status === "invalid" && editValue.length > 0 && (
                <p className="text-xs text-red-400">
                  {editValue.length < 3 ? "Mínimo 3 caracteres." : "Apenas letras minúsculas e números."}
                </p>
              )}
              {saved && <p className="text-xs text-green-400">Salvo!</p>}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-2.5 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </main>
    </div>
  );
}
