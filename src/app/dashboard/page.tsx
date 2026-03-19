"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCharacters } from "@/hooks/use-characters";
import { useInstances } from "@/hooks/use-instances";
import { useCooldownTimer } from "@/hooks/use-cooldown-timer";
import { CharacterBar } from "@/components/characters/character-bar";
import { CharacterForm } from "@/components/characters/character-form";
import { InstanceGroup } from "@/components/instances/instance-group";
import { InstanceSearch } from "@/components/instances/instance-search";
import { InstanceModal } from "@/components/instances/instance-modal";
import { Modal } from "@/components/ui/modal";
import type { Character, InstanceState } from "@/lib/types";

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
}

export default function DashboardPage() {
  const router = useRouter();

  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewChar, setShowNewChar] = useState(false);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [deletingChar, setDeletingChar] = useState<Character | null>(null);
  const [modalInstanceId, setModalInstanceId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const { characters, loading: charsLoading, createCharacter, updateCharacter, refetch: refetchCharacters } = useCharacters();
  const {
    loading: instancesLoading,
    computeStates,
    markDone,
    deleteCompletion,
    toggleActive,
    getHistory,
  } = useInstances(selectedCharId);
  const now = useCooldownTimer();

  // Auto-select first character
  useEffect(() => {
    if (characters.length > 0 && selectedCharId === null) {
      setSelectedCharId(characters[0].id);
    }
  }, [characters, selectedCharId]);

  // Fetch profile on mount + check onboarding
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/");
        return;
      }
      supabase
        .from("profiles")
        .select("display_name, avatar_url, onboarding_completed")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data && !data.onboarding_completed) {
            router.push("/onboarding");
            return;
          }
          if (data) setProfile({ display_name: data.display_name, avatar_url: data.avatar_url });
        });
    });
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleSelectCharacter = (character: Character) => {
    setSelectedCharId(character.id);
  };

  const handleConfirmDelete = async () => {
    if (!deletingChar) return;
    const supabase = createClient();

    const { error: e1 } = await supabase
      .from("instance_completions")
      .delete()
      .eq("character_id", deletingChar.id);
    if (e1) console.error("delete completions:", e1);

    const { error: e2 } = await supabase
      .from("character_instances")
      .delete()
      .eq("character_id", deletingChar.id);
    if (e2) console.error("delete char_instances:", e2);

    const { error: e3 } = await supabase
      .from("characters")
      .delete()
      .eq("id", deletingChar.id);
    if (e3) console.error("delete character:", e3);

    if (selectedCharId === deletingChar.id) {
      setSelectedCharId(null);
    }

    setDeletingChar(null);
    await refetchCharacters();
  };

  const handleEditCharacter = (character: Character) => {
    setEditingChar(character);
  };

  const handleUpdateCharacter = async (data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => {
    if (!editingChar) return;
    await updateCharacter(editingChar.id, data);
    setEditingChar(null);
  };

  const handleCreateCharacter = async (data: {
    name: string;
    class_name: string;
    class_path: string[];
    level: number;
  }) => {
    const newChar = await createCharacter(data);
    setSelectedCharId(newChar.id);
    setShowNewChar(false);
  };

  const isLoading = charsLoading || instancesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center">
        <p className="text-[#A89BC2]">Carregando...</p>
      </div>
    );
  }

  const allStates = computeStates(now);

  // Build suggestions for search autocomplete
  const searchSuggestions = [
    ...[...new Set(allStates.map((s) => s.instance.start_map).filter(Boolean))]
      .sort((a, b) => (a as string).localeCompare(b as string, "pt-BR"))
      .map((m) => ({ label: m as string, value: `map:${m}`, type: "map" as const })),
    ...["A", "B", "C"].map((t) => ({ label: `Liga ${t}`, value: `liga:${t}`, type: "liga" as const })),
  ];

  // Filter by search (name, map, liga tier, difficulty, cooldown type)
  const filteredStates = search.trim()
    ? search.startsWith("map:")
      ? allStates.filter((s) => s.instance.start_map === search.slice(4))
      : search.startsWith("liga:")
        ? allStates.filter((s) => s.instance.liga_tier === search.slice(5))
        : allStates.filter((s) => {
            const q = search.toLowerCase();
            return (
              s.instance.name.toLowerCase().includes(q) ||
              (s.instance.start_map?.toLowerCase().includes(q) ?? false) ||
              (s.instance.liga_tier?.toLowerCase().includes(q) ?? false) ||
              (s.instance.difficulty?.toLowerCase().includes(q) ?? false)
            );
          })
    : allStates;

  const availableStates = filteredStates.filter((s) => s.status === "available");
  const cooldownStates = filteredStates.filter((s) => s.status === "cooldown");
  const inactiveStates = filteredStates.filter((s) => s.status === "inactive");

  // Find modal instance state
  const modalState: InstanceState | null =
    modalInstanceId !== null
      ? (allStates.find((s) => s.instance.id === modalInstanceId) ?? null)
      : null;

  const handleCardClick = (state: InstanceState) => {
    setActionError(null);
    setModalInstanceId(state.instance.id);
  };

  const handleModalClose = () => {
    setModalInstanceId(null);
  };

  const handleMarkDone = async () => {
    if (modalInstanceId === null) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await markDone(modalInstanceId);
      setModalInstanceId(null);
    } catch {
      setActionError("Erro ao marcar instância. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCompletion = async (completionId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteCompletion(completionId);
    } catch {
      setActionError("Erro ao remover conclusão. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (modalInstanceId === null) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await toggleActive(modalInstanceId, false);
      setModalInstanceId(null);
    } catch {
      setActionError("Erro ao desativar instância. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async () => {
    if (modalInstanceId === null) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await toggleActive(modalInstanceId, true);
      setModalInstanceId(null);
    } catch {
      setActionError("Erro ao ativar instância. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a1a] text-white">
      {/* Header */}
      <header className="bg-[#1a1230] border-b border-[#3D2A5C] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-base font-semibold text-white tracking-tight">
            Instanceiro
          </span>
          <div className="flex items-center gap-3">
            {profile?.avatar_url && (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-7 h-7 rounded-full object-cover"
              />
            )}
            {profile?.display_name && (
              <span className="text-sm text-[#A89BC2] hidden sm:inline">
                {profile.display_name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-[#A89BC2] hover:text-white transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-5 py-4 flex flex-col gap-5">
        {/* Character bar */}
        <CharacterBar
          characters={characters}
          selectedId={selectedCharId}
          onSelect={handleSelectCharacter}
          onAddClick={() => setShowNewChar(true)}
          onEdit={handleEditCharacter}
        />

        {characters.length > 0 ? (
          <>
            {/* Instance search */}
            <InstanceSearch value={search} onChange={setSearch} suggestions={searchSuggestions} />

            {/* Instance groups */}
            <div className="flex flex-col gap-8">
              <InstanceGroup
                title="DISPONÍVEIS"
                states={availableStates}
                now={now}
                onCardClick={handleCardClick}
              />
              <InstanceGroup
                title="EM COOLDOWN"
                states={cooldownStates}
                now={now}
                onCardClick={handleCardClick}
              />
              <InstanceGroup
                title="INATIVAS"
                states={inactiveStates}
                now={now}
                onCardClick={handleCardClick}
                collapsible
                defaultCollapsed
                forceExpanded={search.trim().length > 0}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <p className="text-[#A89BC2] text-center">
              Nenhum personagem cadastrado. Adicione um personagem para começar.
            </p>
            <button
              onClick={() => setShowNewChar(true)}
              className="px-5 py-2.5 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Adicionar Personagem
            </button>
          </div>
        )}
      </main>

      {/* Instance modal */}
      <InstanceModal
        isOpen={modalInstanceId !== null}
        onClose={handleModalClose}
        instance={modalState}
        history={modalInstanceId !== null ? getHistory(modalInstanceId) : []}
        isAvailable={modalState?.status === "available"}
        isInactive={modalState?.status === "inactive"}
        onMarkDone={handleMarkDone}
        onDeleteCompletion={handleDeleteCompletion}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        actionLoading={actionLoading}
        actionError={actionError}
      />

      {/* New character modal */}
      <Modal
        isOpen={showNewChar}
        onClose={() => setShowNewChar(false)}
        title="Novo Personagem"
      >
        <CharacterForm
          onSubmit={handleCreateCharacter}
          onCancel={() => setShowNewChar(false)}
        />
      </Modal>

      {/* Edit character modal */}
      <Modal
        isOpen={editingChar !== null}
        onClose={() => setEditingChar(null)}
        title="Editar Personagem"
        titleAction={editingChar ? (
          <button
            onClick={() => { setDeletingChar(editingChar); setEditingChar(null); }}
            className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
            aria-label="Excluir personagem"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        ) : undefined}
      >
        {editingChar && (
          <CharacterForm
            key={editingChar.id}
            onSubmit={handleUpdateCharacter}
            onCancel={() => setEditingChar(null)}
            initialValues={{
              name: editingChar.name,
              class_name: editingChar.class,
              class_path: editingChar.class_path,
              level: editingChar.level,
            }}
            submitLabel="Salvar"
          />
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deletingChar !== null}
        onClose={() => setDeletingChar(null)}
        title="Excluir Personagem"
      >
        {deletingChar && (
          <div className="flex flex-col gap-5">
            <p className="text-[#A89BC2] text-sm">
              Tem certeza que deseja excluir <span className="text-white font-semibold">{deletingChar.name}</span>? Todo o histórico de instâncias será removido. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                Excluir
              </button>
              <button
                onClick={() => setDeletingChar(null)}
                className="flex-1 py-2.5 rounded-md bg-[#2a1f40] border border-[#3D2A5C] text-[#A89BC2] font-semibold text-sm hover:text-white hover:border-[#6B5A8A] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
