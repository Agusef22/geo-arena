"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number toward a target with ease-out cubic.
 *
 * - First mount: animates from `from` (default 0) to `target`.
 * - When `target` changes: animates from the previous target to the new one.
 *
 * Pass `from` when you want the first animation to start from a specific
 * value (e.g., the previous round's total when revealing a result screen).
 */
export function useAnimatedNumber(
  target: number,
  duration = 800,
  from = 0
): number {
  const [current, setCurrent] = useState(from);
  const previousRef = useRef(from);

  useEffect(() => {
    const startValue = previousRef.current;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(startValue + (target - startValue) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    previousRef.current = target;
  }, [target, duration]);

  return current;
}
