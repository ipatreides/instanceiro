"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";

interface CreateCharacterData {
  name: string;
  class_name: string;
  class_path: string[];
  level: number;
}

interface UpdateCharacterData {
  name?: string;
  class_name?: string;
  class_path?: string[];
  level?: number;
}

interface UseCharactersReturn {
  characters: Character[];
  loading: boolean;
  createCharacter: (data: CreateCharacterData, activeInstanceIds?: Set<number>) => Promise<Character>;
  updateCharacter: (id: string, data: UpdateCharacterData) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useCharacters(): UseCharactersReturn {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCharacters = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching characters:", error);
      return;
    }

    setCharacters(data ?? []);
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchCharacters();
    setLoading(false);
  }, [fetchCharacters]);

  useEffect(() => {
    let cancelled = false;
    fetchCharacters().then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchCharacters]);

  const createCharacter = useCallback(
    async (data: CreateCharacterData, activeInstanceIds?: Set<number>): Promise<Character> => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: character, error: charError } = await supabase
        .from("characters")
        .insert({
          user_id: user.id,
          name: data.name,
          class: data.class_name,
          class_path: data.class_path,
          level: data.level,
        })
        .select()
        .single();

      if (charError || !character) {
        throw charError ?? new Error("Failed to create character");
      }

      // Fetch all instances eligible for this character's level
      const { data: instances, error: instancesError } = await supabase
        .from("instances")
        .select("id, level_required, level_max")
        .lte("level_required", data.level);

      if (instancesError) {
        console.error("Error fetching instances for character_instances:", instancesError);
      } else if (instances && instances.length > 0) {
        const eligible = instances.filter((inst: { id: number; level_required: number; level_max: number | null }) =>
          !inst.level_max || data.level <= inst.level_max
        );
        const rows = eligible.map((inst: { id: number; level_required: number; level_max: number | null }) => ({
          character_id: character.id,
          instance_id: inst.id,
          is_active: activeInstanceIds ? activeInstanceIds.has(inst.id) : true,
        }));

        const { error: ciError } = await supabase
          .from("character_instances")
          .insert(rows);

        if (ciError) {
          console.error("Error creating character_instances:", ciError);
        }
      }

      setCharacters((prev) => [...prev, character]);
      return character;
    },
    []
  );

  const updateCharacter = useCallback(
    async (id: string, data: UpdateCharacterData): Promise<void> => {
      const supabase = createClient();
      const updatePayload: Record<string, unknown> = {};
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.class_name !== undefined) updatePayload.class = data.class_name;
      if (data.class_path !== undefined) updatePayload.class_path = data.class_path;
      if (data.level !== undefined) updatePayload.level = data.level;

      const { error } = await supabase
        .from("characters")
        .update(updatePayload)
        .eq("id", id);

      if (error) throw error;

      setCharacters((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...(data.name !== undefined && { name: data.name }),
                ...(data.class_name !== undefined && { class: data.class_name }),
                ...(data.class_path !== undefined && { class_path: data.class_path }),
                ...(data.level !== undefined && { level: data.level }),
              }
            : c
        )
      );
    },
    []
  );

  return { characters, loading, createCharacter, updateCharacter, refetch };
}
