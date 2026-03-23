"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useInvite } from "@/hooks/use-invite";
import { useCharacters } from "@/hooks/use-characters";
import { CharacterForm } from "@/components/characters/character-form";
import { createClient } from "@/lib/supabase/client";
import { FullPageSpinner } from "@/components/ui/spinner";
import { formatBrtDateTime } from "@/lib/format-date";

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data, loading, error, acceptInvite, acceptInviteWithNewChar, createFriendshipOnly } = useInvite(code);
  const { characters, loading: charsLoading } = useCharacters();

  const [mode, setMode] = useState<"choose" | "new_char">("choose");
  const [selectedCharId, setSelectedCharId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Client-side auth guard: redirect unauthenticated users to landing with redirect param
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push(`/?redirect=/invite/${code}`);
      } else {
        setAuthChecked(true);
      }
    });
  }, [code, router]);

  // Schedule not open — still create friendship via RPC (no character needed)
  const [expiredHandled, setExpiredHandled] = useState(false);
  useEffect(() => {
    if (!data || data.schedule.status === "open" || data.user_already_joined || expiredHandled) return;
    createFriendshipOnly().then(() => setExpiredHandled(true));
  }, [data, expiredHandled, createFriendshipOnly]);

  if (!authChecked || loading || charsLoading) {
    return <FullPageSpinner label="Carregando convite..." />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Convite inválido</h1>
          <p className="text-[#A89BC2]">{error ?? "Convite não encontrado"}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  // Already joined
  if (data.user_already_joined) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <p className="text-[#A89BC2]">Você já está neste agendamento.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  // Schedule not open
  if (data.schedule.status !== "open") {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <p className="text-[#A89BC2]">Este agendamento já foi finalizado.</p>
          <p className="text-xs text-[#6B5A8A]">Você foi adicionado como amigo de @{data.creator.username}.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  // Result after action
  if (result) {
    const messages: Record<string, string> = {
      joined: "Você entrou no agendamento!",
      friendship_only: "Agendamento finalizado. Você foi adicionado como amigo.",
      already_joined: "Você já está neste agendamento.",
      full: "O agendamento está cheio (12/12).",
      error: "Erro ao aceitar o convite.",
    };
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <p className="text-[#A89BC2]">{messages[result] ?? result}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer"
          >
            Ir para o dashboard
          </button>
        </div>
      </div>
    );
  }

  const participantCount = data.participants.length + data.placeholders.length + 1; // +1 creator
  const ownChars = characters.filter((c) => !c.isShared);

  const handleJoinWithExisting = async () => {
    if (!selectedCharId) return;
    setActionLoading(true);
    const status = await acceptInvite(selectedCharId);
    setResult(status);
    setActionLoading(false);
  };

  const handleJoinWithNew = async (charData: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => {
    setActionLoading(true);
    const status = await acceptInviteWithNewChar(charData);
    setResult(status);
    setActionLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4 py-8">
      <div className="max-w-lg w-full space-y-6">
        {/* Header card */}
        <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-xl p-6 text-center space-y-3">
          <h1 className="text-2xl font-bold text-white">{data.instance.name}</h1>
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
              {formatBrtDateTime(data.schedule.scheduled_at)}
            </span>
            {data.instance.start_map && (
              <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#D4A843] border border-[#3D2A5C]">
                {data.instance.start_map}
              </span>
            )}
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
              {participantCount}/12
            </span>
          </div>
          <p className="text-sm text-[#A89BC2]">
            Convite de <span className="text-white font-medium">@{data.creator.username}</span>
          </p>
          {data.schedule.message && (
            <p className="text-sm text-[#A89BC2] italic">&ldquo;{data.schedule.message}&rdquo;</p>
          )}
        </div>

        {/* Join section */}
        <div className="bg-[#1a1230] border border-[#3D2A5C] rounded-xl p-6 space-y-4">
          {mode === "choose" ? (
            <>
              <h2 className="text-lg font-semibold text-white">Entrar no agendamento</h2>

              {ownChars.length > 0 && (
                <div className="flex flex-col gap-3">
                  <label className="text-sm text-[#A89BC2]">Escolha um personagem existente:</label>
                  <select
                    value={selectedCharId}
                    onChange={(e) => setSelectedCharId(e.target.value)}
                    className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-[#A89BC2] focus:outline-none focus:border-[#7C3AED]"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="">Selecionar...</option>
                    {ownChars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.class} Lv.{c.level}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleJoinWithExisting}
                    disabled={actionLoading || !selectedCharId}
                    className="px-4 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? "Entrando..." : "Entrar"}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#3D2A5C]" />
                <span className="text-xs text-[#6B5A8A]">ou</span>
                <div className="flex-1 h-px bg-[#3D2A5C]" />
              </div>

              <button
                onClick={() => setMode("new_char")}
                className="w-full px-4 py-2 text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer"
              >
                Criar novo personagem
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Novo personagem</h2>
                <button
                  onClick={() => setMode("choose")}
                  className="text-xs text-[#A89BC2] hover:text-white transition-colors cursor-pointer"
                >
                  ← Voltar
                </button>
              </div>
              <CharacterForm
                onSubmit={handleJoinWithNew}
                submitLabel={actionLoading ? "Entrando..." : "Criar e Entrar"}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
