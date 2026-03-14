"use client";

import { useState, useEffect } from "react";

/**
 * Returns a Date that auto-updates every 60 seconds.
 * Use this as the `now` argument for computeStates() to trigger re-renders.
 */
export function useCooldownTimer(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  return now;
}
