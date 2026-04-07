"use client";

import { useCallback, useRef } from "react";

function createOscillator(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  // Pin placed on map
  const playPin = useCallback(() => {
    const ctx = getCtx();
    createOscillator(ctx, 880, 0.1, "sine", 0.1);
    setTimeout(() => createOscillator(ctx, 1100, 0.08, "sine", 0.08), 50);
  }, [getCtx]);

  // Guess confirmed
  const playConfirm = useCallback(() => {
    const ctx = getCtx();
    createOscillator(ctx, 523, 0.15, "triangle", 0.12);
    setTimeout(() => createOscillator(ctx, 659, 0.15, "triangle", 0.12), 100);
    setTimeout(() => createOscillator(ctx, 784, 0.2, "triangle", 0.1), 200);
  }, [getCtx]);

  // Good score (low penalty)
  const playGood = useCallback(() => {
    const ctx = getCtx();
    createOscillator(ctx, 523, 0.2, "triangle", 0.1);
    setTimeout(() => createOscillator(ctx, 659, 0.2, "triangle", 0.1), 120);
    setTimeout(() => createOscillator(ctx, 784, 0.2, "triangle", 0.1), 240);
    setTimeout(() => createOscillator(ctx, 1047, 0.3, "triangle", 0.12), 360);
  }, [getCtx]);

  // Bad score (high penalty)
  const playBad = useCallback(() => {
    const ctx = getCtx();
    createOscillator(ctx, 330, 0.3, "sawtooth", 0.06);
    setTimeout(() => createOscillator(ctx, 277, 0.4, "sawtooth", 0.05), 200);
  }, [getCtx]);

  // Next round
  const playNext = useCallback(() => {
    const ctx = getCtx();
    createOscillator(ctx, 440, 0.1, "sine", 0.08);
    setTimeout(() => createOscillator(ctx, 554, 0.15, "sine", 0.08), 80);
  }, [getCtx]);

  return { playPin, playConfirm, playGood, playBad, playNext };
}
