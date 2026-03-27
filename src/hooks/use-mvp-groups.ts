"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpGroup, MvpGroupMember } from "@/lib/types";

interface UseMvpGroupsReturn {
  group: MvpGroup | null;
  members: MvpGroupMember[];
  loading: boolean;
  createGroup: (name: string, serverId: number) => Promise<string>;
  inviteCharacter: (groupId: string, characterId: string, userId: string) => Promise<void>;
  leaveGroup: (characterId: string) => Promise<void>;
  updateGroup: (groupId: string, updates: Partial<Pick<MvpGroup, 'name' | 'alert_minutes' | 'discord_channel_id'>>) => Promise<void>;
}

export function useMvpGroups(characterId: string | null): UseMvpGroupsReturn {
  const [group, setGroup] = useState<MvpGroup | null>(null);
  const [members, setMembers] = useState<MvpGroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroup = useCallback(async () => {
    if (!characterId) {
      setGroup(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const { data: membership } = await supabase
      .from("mvp_group_members")
      .select("group_id, role")
      .eq("character_id", characterId)
      .maybeSingle();

    if (!membership) {
      setGroup(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data: groupData } = await supabase
      .from("mvp_groups")
      .select("id, name, server_id, created_by, alert_minutes, discord_channel_id, created_at")
      .eq("id", membership.group_id)
      .single();

    const { data: membersData } = await supabase
      .from("mvp_group_members")
      .select("group_id, character_id, user_id, role, joined_at")
      .eq("group_id", membership.group_id);

    setGroup((groupData as MvpGroup) ?? null);
    setMembers((membersData as MvpGroupMember[]) ?? []);
    setLoading(false);
  }, [characterId]);

  useEffect(() => {
    setLoading(true);
    fetchGroup();
  }, [fetchGroup]);

  const createGroup = useCallback(async (name: string, serverId: number): Promise<string> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !characterId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("mvp_groups")
      .insert({ name, server_id: serverId, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;

    await supabase.from("mvp_group_members").insert({
      group_id: data.id,
      character_id: characterId,
      user_id: user.id,
      role: "owner",
    });

    await fetchGroup();
    return data.id;
  }, [characterId, fetchGroup]);

  const inviteCharacter = useCallback(async (groupId: string, targetCharacterId: string, targetUserId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_group_members").insert({
      group_id: groupId,
      character_id: targetCharacterId,
      user_id: targetUserId,
      role: "member",
    });
    await fetchGroup();
  }, [fetchGroup]);

  const leaveGroup = useCallback(async (charId: string) => {
    const supabase = createClient();
    await supabase
      .from("mvp_group_members")
      .delete()
      .eq("character_id", charId);
    await fetchGroup();
  }, [fetchGroup]);

  const updateGroup = useCallback(async (groupId: string, updates: Partial<Pick<MvpGroup, 'name' | 'alert_minutes' | 'discord_channel_id'>>) => {
    const supabase = createClient();
    await supabase.from("mvp_groups").update(updates).eq("id", groupId);
    await fetchGroup();
  }, [fetchGroup]);

  return { group, members, loading, createGroup, inviteCharacter, leaveGroup, updateGroup };
}
