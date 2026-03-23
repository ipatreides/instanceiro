"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUsernameCheck } from "@/hooks/use-username-check";
import { useCharacters } from "@/hooks/use-characters";
import { useInstances } from "@/hooks/use-instances";
import { useCooldownTimer } from "@/hooks/use-cooldown-timer";
import { CharacterBar } from "@/components/characters/character-bar";
import { CharacterForm } from "@/components/characters/character-form";
import { CharacterShareTab } from "@/components/characters/character-share-tab";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { useFriendships } from "@/hooks/use-friendships";
import { InstanceColumn } from "@/components/instances/instance-column";
import { MobileInstanceTabs } from "@/components/instances/mobile-instance-tabs";
import { InstanceSearch } from "@/components/instances/instance-search";
import { InstanceModal } from "@/components/instances/instance-modal";
import { ScheduleSection } from "@/components/schedules/schedule-section";
import { ScheduleModal } from "@/components/schedules/schedule-modal";
import { ScheduleForm } from "@/components/schedules/schedule-form";
import { useSchedules } from "@/hooks/use-schedules";
import type { InstanceSchedule, ScheduleParticipant } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import type { Character, InstanceState } from "@/lib/types";

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

export default function DashboardPage() {
  const router = useRouter();

  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchFilters, setSearchFilters] = useState<import("@/components/instances/instance-search").SearchFilter[]>([]);
  const [showNewChar, setShowNewChar] = useState(false);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [editTab, setEditTab] = useState<"data" | "share">("data");
  const [deletingChar, setDeletingChar] = useState<Character | null>(null);
  const [modalInstanceId, setModalInstanceId] = useState<number | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [charFormDirty, setCharFormDirty] = useState(false);
  const [scheduleFormDirty, setScheduleFormDirty] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<InstanceSchedule | null>(null);
  const [scheduleParticipants, setScheduleParticipants] = useState<ScheduleParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [schedulingInstanceId, setSchedulingInstanceId] = useState<number | null>(null);
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const usernameStatus = useUsernameCheck(usernameInput);
  const { pendingReceived } = useFriendships();

  const { characters, loading: charsLoading, createCharacter, updateCharacter, refetch: refetchCharacters } = useCharacters();
  const {
    loading: instancesLoading,
    computeStates,
    markDone,
    updateCompletion,
    deleteCompletion,
    toggleActive,
    getHistory,
  } = useInstances(selectedCharId);
  const {
    schedules,
    createSchedule,
    joinSchedule,
    leaveSchedule,
    removeParticipant,
    inviteFriend,
    getEligibleFriends,
    completeSchedule,
    expireSchedule,
    getParticipants,
    generateInviteCode,
    getInviteCode,
    addPlaceholder,
    removePlaceholder,
    getPlaceholders,
  } = useSchedules();
  const now = useCooldownTimer();

  // Close schedule modal if the schedule was completed/expired (realtime update)
  useEffect(() => {
    if (selectedSchedule && !schedules.some((s) => s.id === selectedSchedule.id)) {
      setSelectedSchedule(null);
    }
  }, [schedules, selectedSchedule]);

  // Auto-open schedule modal after creation
  useEffect(() => {
    if (!pendingScheduleId) return;
    const found = schedules.find((s) => s.id === pendingScheduleId);
    if (found) {
      setSelectedSchedule(found);
      getParticipants(found.id).then(setScheduleParticipants);
      setPendingScheduleId(null);
    }
  }, [schedules, pendingScheduleId, getParticipants]);

  // Refresh participants when modal is open (realtime)
  useEffect(() => {
    if (!selectedSchedule) return;
    const supabase = createClient();
    const channel = supabase
      .channel("schedule-participants-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_participants" }, async () => {
        if (selectedSchedule) {
          const p = await getParticipants(selectedSchedule.id);
          setScheduleParticipants(p);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedSchedule, getParticipants]);

  // Auto-select first character
  useEffect(() => {
    if (characters.length > 0 && selectedCharId === null) {
      setSelectedCharId(characters[0].id);
    }
  }, [characters, selectedCharId]);

  // Fetch profile on mount + check if username is missing
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
        .select("display_name, avatar_url, username, onboarding_completed")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            // Check if we have a pending username from signup
            const pendingUsername = typeof window !== "undefined" ? localStorage.getItem("pending_username") : null;
            if (!data.username && pendingUsername) {
              // Auto-save the pending username
              supabase
                .from("profiles")
                .update({ username: pendingUsername, onboarding_completed: true })
                .eq("id", user.id)
                .then(() => {
                  localStorage.removeItem("pending_username");
                  setProfile({ display_name: data.display_name, avatar_url: data.avatar_url, username: pendingUsername });
                });
            } else {
              setProfile({ display_name: data.display_name, avatar_url: data.avatar_url, username: data.username });
              if (!data.username) {
                setNeedsUsername(true);
              }
            }
          }
        });
    });
  }, [router]);

  const handleSaveUsername = useCallback(async () => {
    if (!userId || usernameStatus !== "available") return;
    setUsernameSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ username: usernameInput, onboarding_completed: true })
        .eq("id", userId);
      if (!error) {
        setProfile((prev) => prev ? { ...prev, username: usernameInput } : prev);
        setNeedsUsername(false);
      }
    } finally {
      setUsernameSaving(false);
    }
  }, [userId, usernameInput, usernameStatus]);

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
    setEditTab("data");
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

  // Full-page spinner only on initial load (characters not yet loaded)
  if (charsLoading) {
    return <FullPageSpinner />;
  }

  const allStates = computeStates(now);

  // Build suggestions for search autocomplete
  const searchSuggestions = [
    ...[...new Set(allStates.map((s) => s.instance.start_map).filter(Boolean))]
      .sort((a, b) => (a as string).localeCompare(b as string, "pt-BR"))
      .map((m) => ({ label: m as string, value: m as string, type: "map" as const })),
    ...["A", "B", "C"].map((t) => ({ label: `Liga ${t}`, value: t, type: "liga" as const })),
  ];

  // Filter by search: tags are AND across types, OR within same type
  const filteredStates = allStates.filter((s) => {
    // Group filters by type
    const mapFilters = searchFilters.filter((f) => f.type === "map");
    const ligaFilters = searchFilters.filter((f) => f.type === "liga");

    // Same type = OR, different types = AND
    if (mapFilters.length > 0 && !mapFilters.some((f) => s.instance.start_map === f.value)) return false;
    if (ligaFilters.length > 0 && !ligaFilters.some((f) => s.instance.liga_tier === f.value)) return false;

    // Free text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (
        !s.instance.name.toLowerCase().includes(q) &&
        !(s.instance.start_map?.toLowerCase().includes(q) ?? false) &&
        !(s.instance.liga_tier?.toLowerCase().includes(q) ?? false) &&
        !(s.instance.difficulty?.toLowerCase().includes(q) ?? false)
      ) return false;
    }

    return true;
  });

  // Group by cooldown type for unified column layout
  const COOLDOWN_ORDER: import("@/lib/types").CooldownType[] = ["weekly", "three_day", "daily", "hourly"];
  const statesByType = new Map<import("@/lib/types").CooldownType, InstanceState[]>();
  for (const type of COOLDOWN_ORDER) {
    statesByType.set(type, filteredStates.filter((s) => s.instance.cooldown_type === type));
  }

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

  const handleMarkDone = async (completedAt?: string) => {
    if (modalInstanceId === null) return;
    setActionLoading(true);
    setActionError(null);
    try {
      // If instance is inactive, activate it first
      const state = allStates.find((s) => s.instance.id === modalInstanceId);
      if (state?.status === "inactive") {
        await toggleActive(modalInstanceId, true);
      }
      await markDone(modalInstanceId, completedAt);
      setModalInstanceId(null);
    } catch {
      setActionError("Erro ao marcar instância. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateCompletion = async (completionId: string, completedAt: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await updateCompletion(completionId, completedAt);
    } catch {
      setActionError("Erro ao atualizar horário. Tente novamente.");
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
            {profile?.username && (
              <a
                href="/profile"
                className="text-sm text-[#9B6DFF] hover:text-white transition-colors hidden sm:inline"
              >
                @{profile.username}
              </a>
            )}
            <button
              onClick={() => setShowFriends(true)}
              className="lg:hidden text-sm text-[#A89BC2] hover:text-white transition-colors cursor-pointer relative"
              aria-label="Amigos"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              {pendingReceived.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                  {pendingReceived.length}
                </span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-[#A89BC2] hover:text-white transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
      {/* Main content */}
      <main className="flex-1 min-w-0 max-w-6xl mx-auto px-5 py-4 flex flex-col gap-5">
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
            {/* Scheduled instances */}
            {schedules.length > 0 && (
              <ScheduleSection
                schedules={schedules}
                onCardClick={async (s) => {
                  setSelectedSchedule(s);
                  setScheduleParticipants([]);
                  setParticipantsLoading(true);
                  const p = await getParticipants(s.id);
                  setScheduleParticipants(p);
                  setParticipantsLoading(false);
                }}
              />
            )}

            {/* Instance search */}
            <InstanceSearch
              text={searchText}
              filters={searchFilters}
              onTextChange={setSearchText}
              onAddFilter={(f) => setSearchFilters((prev) => [...prev, f])}
              onRemoveFilter={(i) => setSearchFilters((prev) => prev.filter((_, idx) => idx !== i))}
              suggestions={searchSuggestions}
            />
            {(searchText.trim().length > 0 || searchFilters.length > 0) && (
              <p className="text-xs text-[#6B5A8A]">
                {filteredStates.length} de {allStates.length} instâncias
              </p>
            )}

            {/* Instance columns — single unified layout */}
            {instancesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="md" />
              </div>
            ) : (
            <div className="flex flex-col gap-3">
              {/* Mobile: tabs */}
              <MobileInstanceTabs
                statesByType={statesByType}
                now={now}
                onCardClick={handleCardClick}
              />

              {/* Tablet: 2 columns */}
              <div className="hidden md:grid lg:hidden grid-cols-2 gap-4">
                {COOLDOWN_ORDER.map((type) => (
                  <InstanceColumn
                    key={type}
                    cooldownType={type}
                    states={statesByType.get(type) ?? []}
                    now={now}
                    onCardClick={handleCardClick}
                  />
                ))}
              </div>

              {/* Desktop: 4 columns */}
              <div className="hidden lg:grid grid-cols-4 gap-4">
                {COOLDOWN_ORDER.map((type) => (
                  <InstanceColumn
                    key={type}
                    cooldownType={type}
                    states={statesByType.get(type) ?? []}
                    now={now}
                    onCardClick={handleCardClick}
                  />
                ))}
              </div>
            </div>
            )}
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

      {/* Friends sidebar */}
      <FriendsSidebar isOpen={showFriends} onClose={() => setShowFriends(false)} />
      </div>

      {/* Instance modal */}
      <InstanceModal
        isOpen={modalInstanceId !== null}
        onClose={handleModalClose}
        instance={modalState}
        history={modalInstanceId !== null ? getHistory(modalInstanceId) : []}
        isAvailable={modalState?.status === "available"}
        isInactive={modalState?.status === "inactive"}
        onMarkDone={handleMarkDone}
        onUpdateCompletion={handleUpdateCompletion}
        onDeleteCompletion={handleDeleteCompletion}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        onSchedule={modalState ? () => {
          setSchedulingInstanceId(modalState.instance.id);
          setModalInstanceId(null);
        } : undefined}
        getEligibleFriends={getEligibleFriends}
        actionLoading={actionLoading}
        actionError={actionError}
      />

      {/* New character modal */}
      <Modal
        isOpen={showNewChar}
        onClose={() => setShowNewChar(false)}
        title="Novo Personagem"
        isDirty={charFormDirty}
      >
        <CharacterForm
          onSubmit={handleCreateCharacter}
          onCancel={() => setShowNewChar(false)}
          onDirtyChange={setCharFormDirty}
        />
      </Modal>

      {/* Edit character modal */}
      <Modal
        isOpen={editingChar !== null}
        onClose={() => setEditingChar(null)}
        title="Editar Personagem"
        isDirty={charFormDirty}
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
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-[#3D2A5C]">
              <button
                onClick={() => setEditTab("data")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  editTab === "data"
                    ? "border-[#7C3AED] text-white"
                    : "border-transparent text-[#A89BC2] hover:text-white"
                }`}
              >
                Dados
              </button>
              <button
                onClick={() => setEditTab("share")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  editTab === "share"
                    ? "border-[#7C3AED] text-white"
                    : "border-transparent text-[#A89BC2] hover:text-white"
                }`}
              >
                Compartilhamento
              </button>
            </div>

            {/* Tab content */}
            {editTab === "data" && (
              <CharacterForm
                key={editingChar.id}
                onSubmit={handleUpdateCharacter}
                onCancel={() => setEditingChar(null)}
                onDirtyChange={setCharFormDirty}
                initialValues={{
                  name: editingChar.name,
                  class_name: editingChar.class,
                  class_path: editingChar.class_path,
                  level: editingChar.level,
                }}
                submitLabel="Salvar"
              />
            )}
            {editTab === "share" && (
              <CharacterShareTab characterId={editingChar.id} />
            )}
          </div>
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

      {/* Schedule detail modal */}
      <ScheduleModal
        isOpen={selectedSchedule !== null}
        onClose={() => setSelectedSchedule(null)}
        schedule={selectedSchedule}
        participants={scheduleParticipants}
        loading={participantsLoading}
        currentUserId={userId}
        characters={characters.filter((c) => !c.isShared)}
        onJoin={async (characterId, message) => {
          if (!selectedSchedule) return;
          await joinSchedule(selectedSchedule.id, characterId, message);
          const p = await getParticipants(selectedSchedule.id);
          setScheduleParticipants(p);
        }}
        onLeave={async (characterId) => {
          if (!selectedSchedule) return;
          await leaveSchedule(selectedSchedule.id, characterId);
          const p = await getParticipants(selectedSchedule.id);
          setScheduleParticipants(p);
        }}
        onRemoveParticipant={async (characterId) => {
          if (!selectedSchedule) return;
          await removeParticipant(selectedSchedule.id, characterId);
          const p = await getParticipants(selectedSchedule.id);
          setScheduleParticipants(p);
        }}
        onInvite={async (characterId, targetUserId) => {
          if (!selectedSchedule) return;
          await inviteFriend(selectedSchedule.id, characterId, targetUserId);
          const p = await getParticipants(selectedSchedule.id);
          setScheduleParticipants(p);
        }}
        getEligibleFriends={getEligibleFriends}
        instanceCooldownType={selectedSchedule ? allStates.find((s) => s.instance.id === selectedSchedule.instance_id)?.instance.cooldown_type : undefined}
        instanceCooldownHours={selectedSchedule ? allStates.find((s) => s.instance.id === selectedSchedule.instance_id)?.instance.cooldown_hours : undefined}
        instanceAvailableDay={selectedSchedule ? allStates.find((s) => s.instance.id === selectedSchedule.instance_id)?.instance.available_day : undefined}
        onComplete={async (confirmed) => {
          if (!selectedSchedule) return;
          await completeSchedule(selectedSchedule.id, confirmed);
          setSelectedSchedule(null);
        }}
        onExpire={async () => {
          if (!selectedSchedule) return;
          await expireSchedule(selectedSchedule.id);
          setSelectedSchedule(null);
        }}
        onGenerateInviteCode={generateInviteCode}
        onGetInviteCode={getInviteCode}
        onAddPlaceholder={addPlaceholder}
        onRemovePlaceholder={removePlaceholder}
        onGetPlaceholders={getPlaceholders}
      />

      {/* Schedule creation modal */}
      <Modal
        isOpen={schedulingInstanceId !== null}
        onClose={() => setSchedulingInstanceId(null)}
        title="Agendar Instância"
        isDirty={scheduleFormDirty}
      >
        <ScheduleForm
          onSubmit={async (scheduledAt, message) => {
            if (!schedulingInstanceId || !selectedCharId) return;
            const scheduleId = await createSchedule(schedulingInstanceId, selectedCharId, scheduledAt, message ?? undefined);
            setSchedulingInstanceId(null);
            setPendingScheduleId(scheduleId);
          }}
          onCancel={() => setSchedulingInstanceId(null)}
          onDirtyChange={setScheduleFormDirty}
        />
      </Modal>

      {/* Username prompt modal (non-closable) */}
      {needsUsername && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="bg-[#1a1230] w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-4 border-b border-[#3D2A5C]">
              <h2 className="text-lg font-semibold text-white">Escolha seu @username</h2>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <p className="text-[#A89BC2] text-sm">
                Esse será seu identificador público no Instanceiro.
              </p>

              <div className="flex flex-col gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B5A8A] text-sm font-medium">@</span>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    maxLength={20}
                    placeholder="username"
                    className="w-full bg-[#2a1f40] border border-[#3D2A5C] rounded-md pl-8 pr-10 py-2.5 text-white text-sm placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                    {usernameStatus === "checking" && (
                      <span className="text-[#A89BC2] animate-pulse">...</span>
                    )}
                    {usernameStatus === "available" && (
                      <span className="text-green-400">&#10003;</span>
                    )}
                    {usernameStatus === "taken" && (
                      <span className="text-red-400">&#10007;</span>
                    )}
                    {usernameStatus === "invalid" && usernameInput.length > 0 && (
                      <span className="text-red-400">&#10007;</span>
                    )}
                  </span>
                </div>

                <div className="h-5">
                  {usernameStatus === "taken" && (
                    <p className="text-xs text-red-400">Esse username já está em uso.</p>
                  )}
                  {usernameStatus === "invalid" && usernameInput.length > 0 && (
                    <p className="text-xs text-red-400">
                      {usernameInput.length < 3
                        ? "Mínimo 3 caracteres."
                        : "Apenas letras minúsculas e números."}
                    </p>
                  )}
                  {usernameStatus === "available" && (
                    <p className="text-xs text-green-400">Disponível!</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveUsername}
                  disabled={usernameStatus !== "available" || usernameSaving}
                  className="px-6 py-2 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
                >
                  {usernameSaving ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
