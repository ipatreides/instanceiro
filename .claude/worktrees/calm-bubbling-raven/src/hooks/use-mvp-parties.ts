"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpParty, MvpPartyMember } from "@/lib/types";

interface UseMvpPartiesReturn {
  parties: MvpParty[];
  partyMembers: Map<string, string[]>;
  loading: boolean;
  createParty: (groupId: string, name: string, characterIds: string[]) => Promise<void>;
  updatePartyMembers: (partyId: string, characterIds: string[]) => Promise<void>;
  deleteParty: (partyId: string) => Promise<void>;
}

export function useMvpParties(groupId: string | null): UseMvpPartiesReturn {
  const [parties, setParties] = useState<MvpParty[]>([]);
  const [partyMembers, setPartyMembers] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchParties = useCallback(async () => {
    if (!groupId) {
      setParties([]);
      setPartyMembers(new Map());
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: partiesData } = await supabase
      .from("mvp_parties")
      .select("id, group_id, name, created_by, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    const fetchedParties = (partiesData ?? []) as MvpParty[];
    setParties(fetchedParties);

    if (fetchedParties.length > 0) {
      const { data: membersData } = await supabase
        .from("mvp_party_members")
        .select("party_id, character_id")
        .in("party_id", fetchedParties.map((p) => p.id));

      const map = new Map<string, string[]>();
      for (const m of (membersData ?? []) as MvpPartyMember[]) {
        const list = map.get(m.party_id) ?? [];
        list.push(m.character_id);
        map.set(m.party_id, list);
      }
      setPartyMembers(map);
    } else {
      setPartyMembers(new Map());
    }

    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    fetchParties();
  }, [fetchParties]);

  const createParty = useCallback(async (gId: string, name: string, characterIds: string[]) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("mvp_parties")
      .insert({ group_id: gId, name, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;

    if (characterIds.length > 0) {
      await supabase.from("mvp_party_members").insert(
        characterIds.map((cId) => ({ party_id: data.id, character_id: cId }))
      );
    }

    await fetchParties();
  }, [fetchParties]);

  const updatePartyMembers = useCallback(async (partyId: string, characterIds: string[]) => {
    const supabase = createClient();
    await supabase.from("mvp_party_members").delete().eq("party_id", partyId);
    if (characterIds.length > 0) {
      await supabase.from("mvp_party_members").insert(
        characterIds.map((cId) => ({ party_id: partyId, character_id: cId }))
      );
    }
    await fetchParties();
  }, [fetchParties]);

  const deleteParty = useCallback(async (partyId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_parties").delete().eq("id", partyId);
    await fetchParties();
  }, [fetchParties]);

  return { parties, partyMembers, loading, createParty, updatePartyMembers, deleteParty };
}
