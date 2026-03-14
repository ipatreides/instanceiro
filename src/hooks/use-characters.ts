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

interface UseCharactersReturn {
  characters: Character[];
  loading: boolean;
  createCharacter: (data: CreateCharacterData, activeInstanceIds?: Set<number>) => Promise<Character>;
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

      const { data: character, error: charError } = await supabase
        .from("characters")
        .insert({
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

      // Fetch all active instances to create character_instances for
      const { data: instances, error: instancesError } = await supabase
        .from("instances")
        .select("id")
        .eq("is_active", true);

      if (instancesError) {
        console.error("Error fetching instances for character_instances:", instancesError);
      } else if (instances && instances.length > 0) {
        const rows = instances.map((inst: { id: number }) => ({
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

  return { characters, loading, createCharacter, refetch };
}
