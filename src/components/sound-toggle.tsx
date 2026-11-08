"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { playUiSound, setSoundEnabled, soundEnabled } from "@/lib/ui-sound";

/** One control, one preference: interface sounds on or off. */
export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(soundEnabled());
    const onSound = (event: Event) => setEnabled(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener("folio:sound", onSound);
    return () => window.removeEventListener("folio:sound", onSound);
  }, []);

  return (
    <button
      type="button"
      className="icon-button sound-toggle"
      aria-pressed={enabled}
      aria-label={enabled ? "Mute interface sounds" : "Enable interface sounds"}
      title={enabled ? "Interface sounds on" : "Interface sounds muted"}
      onClick={() => {
        const next = !enabled;
        setSoundEnabled(next);
        setEnabled(next);
        if (next) playUiSound("toggle");
      }}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
  );
}
