"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useUsernameCheck } from "@/hooks/use-username-check";
import { NotificationsSection } from "@/components/profile/notifications-section";
import { Avatar } from "@/components/ui/avatar";
// import { CalendarSection } from "@/components/profile/calendar-section";

const AVATAR_SIZE = 128;
const AVATAR_QUALITY = 0.85;

async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d")!;

      // Crop to square (center)
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to resize"))),
        "image/jpeg",
        AVATAR_QUALITY
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [isTestUser, setIsTestUser] = useState(false);
  const [defaultTab, setDefaultTab] = useState("instances");

  const status = useUsernameCheck(editValue, currentUsername);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/");
        return;
      }
      setUserId(user.id);
      supabase
        .from("profiles")
        .select("username, display_name, avatar_url, is_test_user, default_tab")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCurrentUsername(data.username);
            setDisplayName(data.display_name);
            setEditDisplayName(data.display_name ?? "");
            setEditValue(data.username ?? "");
            setAvatarUrl(data.avatar_url);
            setIsTestUser(data.is_test_user ?? false);
            setDefaultTab(data.default_tab ?? "instances");
          }
          setLoading(false);
        });

      const params = new URLSearchParams(window.location.search);
      if (params.get("discord") === "connected" || params.get("calendar") === "connected") {
        window.history.replaceState({}, "", "/profile");
      }
    });
  }, [router]);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const resized = await resizeImage(file);
      setAvatarFile(resized);
      setAvatarPreview(URL.createObjectURL(resized));
      setSaved(false);
    } catch {
      // Ignore resize errors
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaved(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const updates: Record<string, unknown> = {};

    // Username change
    if (editValue !== (currentUsername ?? "") && status === "available") {
      updates.username = editValue;
    }

    // Display name change
    if (editDisplayName.trim() !== (displayName ?? "")) {
      updates.display_name = editDisplayName.trim() || null;
    }

    // Avatar removal
    if (avatarRemoved && !avatarFile) {
      updates.avatar_url = null;
    }

    // Avatar upload
    if (avatarFile) {
      setUploadingAvatar(true);
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, contentType: "image/jpeg" });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        updates.avatar_url = `${urlData.publicUrl}?v=${Date.now()}`;
      }
      setUploadingAvatar(false);
    }

    if (Object.keys(updates).length === 0) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (!error) {
      if (updates.username) setCurrentUsername(updates.username as string);
      if (updates.display_name !== undefined) setDisplayName(updates.display_name as string | null);
      if ("avatar_url" in updates) {
        setAvatarUrl(updates.avatar_url as string | null);
        setAvatarPreview(null);
        setAvatarFile(null);
        setAvatarRemoved(false);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEditValue(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
    setSaved(false);
  }

  const usernameChanged = editValue !== (currentUsername ?? "");
  const nameChanged = editDisplayName.trim() !== (displayName ?? "");
  const avatarChanged = avatarFile !== null || avatarRemoved;
  const hasChanges = (usernameChanged && status === "available") || nameChanged || avatarChanged;
  const canSave = hasChanges && !saving;

  if (loading) {
    return <FullPageSpinner />;
  }

  const displayedAvatar = avatarRemoved ? null : (avatarPreview ?? avatarUrl);


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
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <Avatar src={displayedAvatar} name={editDisplayName.trim() || displayName} size="lg" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
            <div className="flex gap-3 text-[13px]">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-primary hover:text-primary-hover transition-colors cursor-pointer"
              >
                Alterar foto
              </button>
              {displayedAvatar && (
                <button
                  onClick={() => { setAvatarRemoved(true); setAvatarFile(null); setAvatarPreview(null); setSaved(false); }}
                  className="text-text-secondary hover:text-status-error transition-colors cursor-pointer"
                >
                  Remover foto
                </button>
              )}
            </div>
            {uploadingAvatar && <p className="text-xs text-text-secondary">Enviando...</p>}
          </div>

          {/* Display name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-secondary">Nome</label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => { setEditDisplayName(e.target.value); setSaved(false); }}
              maxLength={50}
              placeholder="Seu nome"
              className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Username edit */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-secondary">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">@</span>
              <input
                type="text"
                value={editValue}
                onChange={handleUsernameChange}
                maxLength={20}
                className="w-full bg-surface border border-border rounded-md pl-8 pr-10 py-2.5 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                {status === "checking" && <span className="text-text-secondary animate-pulse">...</span>}
                {status === "available" && usernameChanged && <span className="text-status-available">✓</span>}
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
        {/* Default tab preference — test users only */}
        {isTestUser && (
          <div className="mt-6">
            <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
              <h2 className="text-[22px] font-semibold text-text-primary">Preferências</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-secondary">Aba padrão:</span>
                <div className="flex gap-1">
                  {(["instances", "mvps"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={async () => {
                        setDefaultTab(tab);
                        const supabase = createClient();
                        await supabase.from("profiles").update({ default_tab: tab }).eq("id", userId);
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                        defaultTab === tab
                          ? "bg-primary text-white"
                          : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {tab === "instances" ? "Instâncias" : "MVPs"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <NotificationsSection />
        </div>
        {/* Bot invite — for MVP Timer Discord notifications */}
        {isTestUser && (
          <div className="mt-6">
            <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
              <h2 className="text-[22px] font-semibold text-text-primary">Bot do Instanceiro</h2>
              <p className="text-sm text-text-secondary">
                Adicione o bot do Instanceiro ao seu servidor do Discord para receber alertas de MVP no canal configurado.
              </p>
              <a
                href={`https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? ""}&permissions=2048&scope=bot`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
              >
                Adicionar bot ao servidor
              </a>
              <p className="text-[10px] text-text-secondary">
                O bot precisa da permissão "Enviar Mensagens" no canal configurado. Após adicionar, copie o ID do canal no hub do grupo MVP.
              </p>
            </div>
          </div>
        )}

        {/* Calendar integration disabled — requires Google OAuth verification
        <div className="mt-6">
          <CalendarSection />
        </div>
        */}
      </main>
    </div>
  );
}
