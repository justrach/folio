"use client";

/**
 * Small UI sounds, synthesised rather than shipped as files.
 *
 * The workspace plays a tick when a row is selected, a rising pair when an action
 * succeeds, and a low blip when it fails. Sounds are on by default because they
 * are part of the interface, and the toggle in the top bar persists a preference
 * in `localStorage`. Nothing plays until the browser has had a user gesture, which
 * is also when a real user first hears it.
 */
export type UiSound = "select" | "success" | "error" | "toggle";

const STORAGE_KEY = "folio-ui-sound";

let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  window.dispatchEvent(new CustomEvent("folio:sound", { detail: enabled }));
}

function tone(audio: AudioContext, frequency: number, start: number, duration: number, gain: number, type: OscillatorType) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime + start);
  envelope.gain.setValueAtTime(0.0001, audio.currentTime + start);
  envelope.gain.exponentialRampToValueAtTime(gain, audio.currentTime + start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + duration);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(audio.currentTime + start);
  oscillator.stop(audio.currentTime + start + duration + 0.02);
}

export function playUiSound(sound: UiSound) {
  if (!soundEnabled() || typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    if (sound === "select") tone(context, 1180, 0, 0.05, 0.025, "sine");
    if (sound === "toggle") tone(context, 880, 0, 0.06, 0.03, "sine");
    if (sound === "success") { tone(context, 660, 0, 0.08, 0.03, "sine"); tone(context, 990, 0.06, 0.12, 0.028, "sine"); }
    if (sound === "error") { tone(context, 320, 0, 0.09, 0.035, "triangle"); tone(context, 220, 0.07, 0.14, 0.03, "triangle"); }
  } catch {
    // Audio is a nicety; a blocked context must never break an action.
  }
}
