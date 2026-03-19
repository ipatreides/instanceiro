"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const USERNAME_REGEX = /^[a-z0-9]{3,20}$/;

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function isValidUsername(value: string): boolean {
  return USERNAME_REGEX.test(value);
}

export function useUsernameCheck(username: string, currentUsername?: string | null) {
  const [status, setStatus] = useState<UsernameStatus>("idle");

  useEffect(() => {
    if (!username) {
      setStatus("idle");
      return;
    }

    if (!isValidUsername(username)) {
      setStatus("invalid");
      return;
    }

    if (currentUsername && username === currentUsername) {
      setStatus("available");
      return;
    }

    setStatus("checking");
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      setStatus(data ? "taken" : "available");
    }, 300);

    return () => clearTimeout(timer);
  }, [username, currentUsername]);

  return status;
}
