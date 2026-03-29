"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUsernameCheck } from "@/hooks/use-username-check";
import { useCharacters } from "@/hooks/use-characters";
import { useInstances } from "@/hooks/use-instances";
import { useCooldownTimer } from "@/hooks/use-cooldown-timer";
import { calculateCooldownExpiry } from "@/lib/cooldown";
import type { CooldownType } from "@/lib/types";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountBar } from "@/components/accounts/account-bar";
import { AccountModal } from "@/components/accounts/account-modal";
import { CreateAccountModal } from "@/components/accounts/create-account-modal";
import { CharacterForm } from "@/components/characters/character-form";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { useFriendships } from "@/hooks/use-friendships";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationBell } from "@/components/notifications/notification-bell";
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
import { Avatar } from "@/components/ui/avatar";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Account, Character, InstanceState } from "@/lib/types";
import { MvpTab } from "@/components/mvp/mvp-tab";
import { TierContext, useTierProvider } from "@/hooks/use-tier";
import { TierIndicator } from "@/components/tier/tier-indicator";
import { PremiumGate } from "@/components/tier/premium-gate";
import { PremiumBadge } from "@/components/tier/premium-badge";
import { wasDowngradeExported, exportToLocalStorage } from "@/lib/local-tracker";

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  is_test_user?: boolean;
  default_tab?: string;
}

export default function DashboardPage() {
  const router = useRouter();

  const [selectedCharId, setSelectedCharIdRaw] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("selectedCharId");
  });
  const setSelectedCharId = (id: string | null) => {
    setSelectedCharIdRaw(id);
    if (id) localStorage.setItem("selectedCharId", id);
    else localStorage.removeItem("selectedCharId");
  };
  const [searchText, setSearchText] = useState("");
  const [activeMainTab, setActiveMainTab] = useState<"instances" | "mvps">("instances");
  const [searchFilters, setSearchFilters] = useState<import("@/components/instances/instance-search").SearchFilter[]>([]);
  const [showNewChar, setShowNewChar] = useState(false);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
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
  const [schedulingParticipants, setSchedulingParticipants] = useState<import("@/components/instances/participant-list").Participant[]>([]);
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [downgradeNotice, setDowngradeNotice] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const usernameStatus = useUsernameCheck(usernameInput);
  const { pendingReceived } = useFriendships();
  const { notifications, unreadCount, respondToPartyConfirm } = useNotifications();
  const tierValue = useTierProvider(userId);

  const { accounts, servers, loading: accountsLoading, createAccount, updateAccount, deleteAccount, reorderAccounts, reorderCharacters: reorderChars, refetch: refetchAccounts } = useAccounts();
  const [accountModalAccount, setAccountModalAccount] = useState<Account | null>(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const { characters, loading: charsLoading, createCharacter, updateCharacter, reorderCharacters: reorderCharsLocal, refetch: refetchCharacters } = useCharacters();
  const {
    loading: instancesLoading,
    completions,
    computeStates,
    markDone,
    updateCompletion,
    deleteCompletion,
    toggleActive,
    getHistory,
    completeParty,
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
    updateScheduleTime,
    updateScheduleTitle,
    getParticipants,
    addPlaceholder,
    removePlaceholder,
    getPlaceholders,
    getScheduledCharacterIds,
    getScheduledCharsWithTimes,
    claimPlaceholder,
    unclaimPlaceholder,
    getEligibleForPlaceholder,
  } = useSchedules();
  const now = useCooldownTimer();

  // Sync selectedSchedule with latest data from schedules (realtime updates)
  useEffect(() => {
    if (!selectedSchedule) return;
    const updated = schedules.find((s) => s.id === selectedSchedule.id);
    if (!updated) {
      setSelectedSchedule(null);
    } else if (updated !== selectedSchedule) {
      setSelectedSchedule(updated);
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

  // Refresh participants in real-time when modal is open
  useEffect(() => {
    if (!selectedSchedule) return;
    getParticipants(selectedSchedule.id).then(setScheduleParticipants);
    const supabase = createClient();
    const channel = supabase
      .channel("schedule-participants-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_participants", filter: `schedule_id=eq.${selectedSchedule.id}` }, async () => {
        const p = await getParticipants(selectedSchedule.id);
        setScheduleParticipants(p);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedSchedule, getParticipants]);

  // Auto-select character: restore from localStorage or pick first
  useEffect(() => {
    if (characters.length === 0) return;
    if (selectedCharId && characters.some((c) => c.id === selectedCharId)) return;
    setSelectedCharId(characters[0].id);
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
        .select("display_name, avatar_url, username, onboarding_completed, is_test_user, default_tab")
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
                  setProfile({ display_name: data.display_name, avatar_url: data.avatar_url, username: pendingUsername, is_test_user: data.is_test_user, default_tab: data.default_tab });
                });
            } else {
              setProfile({ display_name: data.display_name, avatar_url: data.avatar_url, username: data.username, is_test_user: data.is_test_user, default_tab: data.default_tab });
              if (!data.username) {
                setNeedsUsername(true);
              }
            }
          }
        });
    });
  }, [router]);

  // Set default tab from profile preference (only on initial load)
  const [tabInitialized, setTabInitialized] = useState(false);
  useEffect(() => {
    if (tabInitialized || !profile?.default_tab) return;
    if (profile.default_tab === "mvps") {
      setActiveMainTab("mvps");
    }
    setTabInitialized(true);
  }, [profile, tabInitialized]);

  // Task 19: Downgrade export — when a premium user loses access, export their data to localStorage
  useEffect(() => {
    if (!userId) return; // Wait for auth — without userId, tier defaults to free
    if (tierValue.loading || tierValue.isPremium) return;
    if (wasDowngradeExported()) return;

    const run = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch first account
        const { data: accs } = await supabase
          .from("accounts")
          .select("id, server_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();
        if (!accs) return;

        // Fetch first character of that account
        const { data: char } = await supabase
          .from("characters")
          .select("id")
          .eq("account_id", accs.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .limit(1)
          .single();
        if (!char) return;

        // Fetch completions for that character
        const { data: comps } = await supabase
          .from("instance_completions")
          .select("instance_id, completed_at")
          .eq("character_id", char.id);

        // Fetch MVP kills for that character
        const { data: kills } = await supabase
          .from("mvp_kills")
          .select("mvp_id, killed_at")
          .eq("character_id", char.id);

        const instances: Record<string, { completed_at: string }> = {};
        for (const c of comps ?? []) {
          instances[String(c.instance_id)] = { completed_at: c.completed_at };
        }

        const mvpKills: Record<string, { killed_at: string }> = {};
        for (const k of kills ?? []) {
          mvpKills[String(k.mvp_id)] = { killed_at: k.killed_at };
        }

        exportToLocalStorage(instances, mvpKills, accs.server_id ?? "freya");
        setDowngradeNotice(true);
      } catch {
        // Don't crash the dashboard on export failure
      }
    };
    run();
  }, [tierValue.loading, tierValue.isPremium]);

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
    account_id?: string;
  }) => {
    const newChar = await createCharacter({ ...data, account_id: data.account_id ?? "" });
    setSelectedCharId(newChar.id);
    setShowNewChar(false);
  };

  // Full-page spinner only on initial load (characters/accounts not yet loaded)
  if (charsLoading || accountsLoading) {
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

  const isSearching = searchText.trim().length > 0 || searchFilters.length > 0;

  // Filter by search: tags are AND across types, OR within same type
  const filteredStates = allStates.filter((s) => {
    // Group filters by type
    const mapFilters = searchFilters.filter((f) => f.type === "map");
    const ligaFilters = searchFilters.filter((f) => f.type === "liga");

    // Same type = OR, different types = AND
    if (mapFilters.length > 0 && !mapFilters.some((f) => s.instance.start_map === f.value)) return false;
    if (ligaFilters.length > 0 && !ligaFilters.some((f) => s.instance.liga_tier === f.value)) return false;

    // Free text search (accent-insensitive)
    if (searchText.trim()) {
      const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const q = normalize(searchText);
      if (
        !normalize(s.instance.name).includes(q) &&
        !normalize(s.instance.aliases?.join(" ") ?? "").includes(q) &&
        !(s.instance.start_map ? normalize(s.instance.start_map).includes(q) : false) &&
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
    <TierContext.Provider value={tierValue}>
    <div className="h-screen flex flex-col bg-bg text-text-primary overflow-hidden">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-3">
            <Avatar src={profile?.avatar_url} name={profile?.display_name} size="sm" />
            {profile?.username && (
              <a
                href="/profile"
                className="text-sm text-primary hover:text-text-primary transition-colors hidden sm:inline"
              >
                @{profile.username}
              </a>
            )}
            <button
              onClick={() => setShowFriends(true)}
              className="lg:hidden text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer relative"
              aria-label="Amigos"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              {pendingReceived.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-status-error rounded-full text-[10px] text-text-primary flex items-center justify-center font-bold">
                  {pendingReceived.length}
                </span>
              )}
            </button>
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onRespond={respondToPartyConfirm}
            />
            <TierIndicator />
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Downgrade notice */}
      {downgradeNotice && (
        <div className="bg-[color-mix(in_srgb,var(--status-error)_12%,transparent)] border-b border-status-error px-5 py-2 flex items-center justify-between text-sm">
          <span className="text-status-error-text">Seu plano foi alterado para gratuito. Seus dados foram salvos localmente.</span>
          <button onClick={() => setDowngradeNotice(false)} className="text-status-error-text opacity-70 hover:opacity-100 ml-4 cursor-pointer">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
      {/* Main content */}
      <main className="flex-1 min-w-0 max-w-6xl mx-auto px-5 py-4 flex flex-col gap-5 h-full overflow-auto">
        {/* Account bar */}
        <AccountBar
          accounts={accounts}
          characters={characters}
          selectedCharId={selectedCharId}
          onSelectChar={handleSelectCharacter}
          onEditChar={handleEditCharacter}
          onOpenAccountModal={(account) => setAccountModalAccount(account)}
          onCreateAccount={() => setShowCreateAccount(true)}
          onReorderAccounts={reorderAccounts}
          onReorderCharacters={async (accountId, orderedCharIds) => {
            // Optimistic local update (instant, no flash)
            reorderCharsLocal(orderedCharIds);
            // Persist to DB in background
            reorderChars(accountId, orderedCharIds);
          }}
        />

        {/* Main tab switcher — MVP tab only visible for test users */}
        {(
        <div className="flex gap-1 border-b border-border pb-1">
          <button
            onClick={() => setActiveMainTab("instances")}
            className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
              activeMainTab === "instances"
                ? "text-text-primary border-b-2 border-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Instâncias
          </button>
          <button
            onClick={() => setActiveMainTab("mvps")}
            className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
              activeMainTab === "mvps"
                ? "text-text-primary border-b-2 border-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            MVPs
          </button>
        </div>
        )}

        {characters.length > 0 ? (
          activeMainTab === "instances" ? (
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
              <p className="text-xs text-text-secondary">
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
                forceShowInactive={isSearching}
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
                    forceShowInactive={isSearching}
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
                    forceShowInactive={isSearching}
                  />
                ))}
              </div>
            </div>
            )}
          </>
          ) : (
            <MvpTab
              selectedCharId={selectedCharId}
              characters={characters}
              accounts={accounts}
              userId={userId}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <p className="text-text-secondary text-center">
              Nenhum personagem cadastrado. Crie uma conta para começar.
            </p>
            <button
              onClick={() => setShowCreateAccount(true)}
              className="px-5 py-2.5 rounded-md bg-primary hover:bg-primary-hover text-text-primary font-semibold text-sm transition-colors cursor-pointer"
            >
              Criar Conta
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
        characters={characters}
        accounts={accounts}
        selectedCharId={selectedCharId}
        allCompletions={completions}
        onCompleteParty={async (ownCharIds, friends, completedAt) => {
          if (modalInstanceId === null) return;
          setActionLoading(true);
          setActionError(null);
          try {
            // If instance is inactive for the selected character, activate it first
            const state = allStates.find((s) => s.instance.id === modalInstanceId);
            if (state?.status === "inactive") {
              await toggleActive(modalInstanceId, true);
            }
            await completeParty(modalInstanceId, ownCharIds, friends, completedAt);
            setModalInstanceId(null);
          } catch {
            setActionError("Erro ao marcar instância. Tente novamente.");
          } finally {
            setActionLoading(false);
          }
        }}
        onUpdateCompletion={handleUpdateCompletion}
        onDeleteCompletion={handleDeleteCompletion}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        onSchedule={modalState ? (modalParticipants) => {
          setSchedulingInstanceId(modalState.instance.id);
          setSchedulingParticipants(modalParticipants);
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
            className="text-text-secondary hover:text-status-error transition-colors cursor-pointer"
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
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deletingChar !== null}
        onClose={() => setDeletingChar(null)}
        title="Excluir Personagem"
      >
        {deletingChar && (
          <div className="flex flex-col gap-5">
            <p className="text-text-secondary text-sm">
              Tem certeza que deseja excluir <span className="text-text-primary font-semibold">{deletingChar.name}</span>? Todo o histórico de instâncias será removido. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-md bg-status-error hover:opacity-90 text-text-primary font-semibold text-sm transition-colors cursor-pointer"
              >
                Excluir
              </button>
              <button
                onClick={() => setDeletingChar(null)}
                className="flex-1 py-2.5 rounded-md bg-surface border border-border text-text-secondary font-semibold text-sm hover:text-text-primary hover:border-text-secondary transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Account modal */}
      <AccountModal
        isOpen={accountModalAccount !== null}
        onClose={() => setAccountModalAccount(null)}
        autoShowCharForm={accountModalAccount ? characters.filter(c => c.account_id === accountModalAccount.id).length === 0 : false}
        account={accountModalAccount}
        characters={characters.filter(c => c.account_id === accountModalAccount?.id)}
        totalCharacterCount={characters.length}
        servers={servers}
        onUpdateName={async (name) => {
          if (!accountModalAccount) return;
          await updateAccount(accountModalAccount.id, { name });
          setAccountModalAccount(prev => prev ? { ...prev, name } : null);
        }}
        onDeleteAccount={async () => {
          if (!accountModalAccount) return;
          await deleteAccount(accountModalAccount.id);
          setAccountModalAccount(null);
          await refetchCharacters();
        }}
        onCreateCharacter={async (data) => {
          await createCharacter(data);
        }}
        onDeleteCharacter={async (charId) => {
          const supabase = (await import("@/lib/supabase/client")).createClient();
          await supabase.from("instance_completions").delete().eq("character_id", charId);
          await supabase.from("character_instances").delete().eq("character_id", charId);
          await supabase.from("characters").delete().eq("id", charId);
          if (selectedCharId === charId) setSelectedCharId(null);
          await refetchCharacters();
        }}
      />

      {/* Create account modal */}
      <CreateAccountModal
        isOpen={showCreateAccount}
        onClose={() => setShowCreateAccount(false)}
        servers={servers}
        onCreate={async (name, serverId) => {
          const account = await createAccount(name, serverId);
          return account;
        }}
        onCreateCharacter={async (data) => {
          await createCharacter(data);
        }}
      />

      {/* Schedule detail modal */}
      <ScheduleModal
        isOpen={selectedSchedule !== null}
        onClose={() => setSelectedSchedule(null)}
        schedule={selectedSchedule}
        participants={scheduleParticipants}
        loading={participantsLoading}
        currentUserId={userId}
        characters={characters}
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
        onUpdateTime={async (scheduledAt) => {
          if (!selectedSchedule) return;
          await updateScheduleTime(selectedSchedule.id, scheduledAt);
        }}
        onUpdateTitle={async (title) => {
          if (!selectedSchedule) return;
          await updateScheduleTitle(selectedSchedule.id, title);
        }}
        onAddPlaceholder={addPlaceholder}
        onRemovePlaceholder={removePlaceholder}
        onGetPlaceholders={getPlaceholders}
        onClaimPlaceholder={claimPlaceholder}
        onUnclaimPlaceholder={unclaimPlaceholder}
        onGetEligibleForPlaceholder={getEligibleForPlaceholder}
        getScheduledCharsWithTimes={getScheduledCharsWithTimes}
      />

      {/* Schedule creation modal */}
      <Modal
        isOpen={schedulingInstanceId !== null}
        onClose={() => { setSchedulingInstanceId(null); setScheduleError(null); }}
        title="Agendar Instância"
        isDirty={scheduleFormDirty}
      >
        <ScheduleForm
          onSubmit={async (scheduledAt, message, title) => {
            if (!schedulingInstanceId || !selectedCharId) return;
            // Check cooldown-aware conflicts
            const instance = allStates.find((s) => s.instance.id === schedulingInstanceId)?.instance;
            const existingSchedules = await getScheduledCharsWithTimes(schedulingInstanceId);
            const allParticipantIds = [selectedCharId, ...schedulingParticipants.map((p) => p.character_id)];
            const newTime = new Date(scheduledAt);

            const conflicting = allParticipantIds.filter((charId) => {
              // Find existing schedules for this character
              const charSchedules = existingSchedules.filter((s) => s.character_id === charId);
              return charSchedules.some((existing) => {
                if (!instance) return true; // safety: block if no instance data
                const existingTime = new Date(existing.scheduled_at);
                // Two schedules conflict if they're in the same cooldown period
                const expiryFromExisting = calculateCooldownExpiry(existingTime, instance.cooldown_type, instance.cooldown_hours, instance.available_day);
                const expiryFromNew = calculateCooldownExpiry(newTime, instance.cooldown_type, instance.cooldown_hours, instance.available_day);
                // Conflict: new is before existing's expiry AND existing is before new's expiry
                return newTime < expiryFromExisting && existingTime < expiryFromNew;
              });
            });

            if (conflicting.length > 0) {
              setScheduleError("Um ou mais personagens já estão agendados para esta instância no mesmo período de cooldown.");
              return;
            }
            setScheduleError(null);
            const scheduleId = await createSchedule(schedulingInstanceId, selectedCharId, scheduledAt, message ?? undefined, title ?? undefined);
            // Add participants that were in the instance modal
            for (const p of schedulingParticipants) {
              if (p.character_id === selectedCharId) continue; // already the creator
              try {
                if (p.type === "own") {
                  await joinSchedule(scheduleId, p.character_id);
                } else {
                  await inviteFriend(scheduleId, p.character_id, p.user_id);
                }
              } catch {
                // Best-effort: don't block schedule creation if adding fails
              }
            }
            setSchedulingInstanceId(null);
            setSchedulingParticipants([]);
            setPendingScheduleId(scheduleId);
          }}
          onCancel={() => { setSchedulingInstanceId(null); setSchedulingParticipants([]); setScheduleError(null); }}
          onDirtyChange={setScheduleFormDirty}
          error={scheduleError}
        />
      </Modal>

      {/* Username prompt modal (non-closable) */}
      {needsUsername && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="bg-surface w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Escolha seu @username</h2>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <p className="text-text-secondary text-sm">
                Esse será seu identificador público no Instanceiro.
              </p>

              <div className="flex flex-col gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">@</span>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    maxLength={20}
                    placeholder="username"
                    className="w-full bg-surface border border-border rounded-md pl-8 pr-10 py-2.5 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                    {usernameStatus === "checking" && (
                      <span className="text-text-secondary animate-pulse">...</span>
                    )}
                    {usernameStatus === "available" && (
                      <span className="text-status-available">&#10003;</span>
                    )}
                    {usernameStatus === "taken" && (
                      <span className="text-status-error">&#10007;</span>
                    )}
                    {usernameStatus === "invalid" && usernameInput.length > 0 && (
                      <span className="text-status-error">&#10007;</span>
                    )}
                  </span>
                </div>

                <div className="h-5">
                  {usernameStatus === "taken" && (
                    <p className="text-xs text-status-error">Esse username já está em uso.</p>
                  )}
                  {usernameStatus === "invalid" && usernameInput.length > 0 && (
                    <p className="text-xs text-status-error">
                      {usernameInput.length < 3
                        ? "Mínimo 3 caracteres."
                        : "Apenas letras minúsculas e números."}
                    </p>
                  )}
                  {usernameStatus === "available" && (
                    <p className="text-xs text-status-available">Disponível!</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveUsername}
                  disabled={usernameStatus !== "available" || usernameSaving}
                  className="px-6 py-2 rounded-md bg-primary text-text-primary font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors cursor-pointer"
                >
                  {usernameSaving ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </TierContext.Provider>
  );
}
