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
  const [modalInstanceId, setModalInstanceId] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const { characters, loading: charsLoading, createCharacter } = useCharacters();
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
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  const allStates = computeStates(now);

  // Filter by search
  const filteredStates = search.trim()
    ? allStates.filter((s) =>
        s.instance.name.toLowerCase().includes(search.toLowerCase())
      )
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
    setModalInstanceId(state.instance.id);
  };

  const handleModalClose = () => {
    setModalInstanceId(null);
  };

  const handleMarkDone = async () => {
    if (modalInstanceId === null) return;
    await markDone(modalInstanceId);
    setModalInstanceId(null);
  };

  const handleDeleteCompletion = async (completionId: string) => {
    await deleteCompletion(completionId);
  };

  const handleDeactivate = async () => {
    if (modalInstanceId === null) return;
    await toggleActive(modalInstanceId, false);
    setModalInstanceId(null);
  };

  const handleActivate = async () => {
    if (modalInstanceId === null) return;
    await toggleActive(modalInstanceId, true);
    setModalInstanceId(null);
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      {/* Header */}
      <header className="bg-[#1a1a2e] border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-base font-semibold text-white tracking-tight">
            RO Instance Tracker
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
              <span className="text-sm text-gray-300 hidden sm:inline">
                {profile.display_name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
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
        />

        {/* Instance search */}
        <InstanceSearch value={search} onChange={setSearch} />

        {/* Instance groups */}
        <div className="flex flex-col gap-8">
          <InstanceGroup
            title="DISPONÍVEIS"
            states={availableStates}
            onCardClick={handleCardClick}
          />
          <InstanceGroup
            title="EM COOLDOWN"
            states={cooldownStates}
            onCardClick={handleCardClick}
          />
          <InstanceGroup
            title="INATIVAS"
            states={inactiveStates}
            onCardClick={handleCardClick}
            collapsible
            defaultCollapsed
            forceExpanded={search.trim().length > 0}
          />
        </div>

        {/* Empty state */}
        {characters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <p className="text-gray-400 text-center">
              Nenhum personagem cadastrado. Adicione um personagem para começar.
            </p>
            <button
              onClick={() => setShowNewChar(true)}
              className="px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors cursor-pointer"
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
    </div>
  );
}
