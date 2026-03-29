"use client";

import { useRef, useCallback } from "react";

/**
 * Hook for mouse drag-to-scroll on horizontal overflow containers.
 * Touch scrolling works natively — this adds mouse drag support.
 *
 * Usage:
 *   const drag = useDragScroll();
 *   <div ref={drag.ref} {...drag.handlers} className="overflow-x-auto">
 */
export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const moved = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.pageX - ref.current.offsetLeft;
    scrollLeft.current = ref.current.scrollLeft;
    ref.current.style.cursor = "grabbing";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 3) moved.current = true;
    ref.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  const onMouseUp = useCallback(() => {
    if (!ref.current) return;
    dragging.current = false;
    ref.current.style.cursor = "";
  }, []);

  /** Returns true if a drag happened — use to prevent click on children */
  const wasDragged = useCallback(() => moved.current, []);

  const handlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
  };

  return { ref, handlers, wasDragged };
}
