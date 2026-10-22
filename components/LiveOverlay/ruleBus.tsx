/**
 * Fired stream rules, fanned out to whatever on screen plays them. The twin of
 * dehubweb src/components/app/live/overlay/rule-bus.tsx.
 *
 * A separate channel from the room-event bus: a fired rule is not a room event
 * a widget counts, it is a finished instruction — these alerts, these sounds,
 * these lines read aloud — already filled in by the server.
 */
import { createContext, useContext, useEffect, useRef } from "react";
import { createAudioPlayer } from "expo-audio";
import { RULE_SOUND_FILES, type RuleFired } from "../../libs/live-overlay/rules";
import { isTipTtsEnabled, speakTipMessage } from "../../libs/tipTts";

export type RuleBus = {
  subscribe: (listener: (fired: RuleFired) => void) => () => void;
  publish: (fired: RuleFired) => void;
};

export function createRuleBus(): RuleBus {
  const listeners = new Set<(fired: RuleFired) => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (fired) => listeners.forEach((listener) => listener(fired)),
  };
}

export const RuleBusContext = createContext<RuleBus | null>(null);

/** Hear fired rules inside a component. The handler may be an inline closure. */
export function useRuleFired(onFired: (fired: RuleFired) => void) {
  const bus = useContext(RuleBusContext);
  const handler = useRef(onFired);
  handler.current = onFired;
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe((fired) => handler.current(fired));
  }, [bus]);
}

/** Longest a sound may hold its player before it is released anyway. */
const SOUND_RELEASE_MS = 15_000;

function playSound(uri: string) {
  try {
    const player = createAudioPlayer({ uri });
    player.volume = 0.8;
    const sub = player.addListener("playbackStatusUpdate", (status: any) => {
      if (status?.didJustFinish) release();
    });
    const timer = setTimeout(() => release(), SOUND_RELEASE_MS);
    let released = false;
    function release() {
      if (released) return;
      released = true;
      clearTimeout(timer);
      try {
        sub.remove();
        player.release();
      } catch {}
    }
    player.play();
  } catch {
    // A sound that cannot play (an .ogg on iOS) is simply not heard.
  }
}

/**
 * Plays a fired rule's sounds and reads its lines aloud, following the
 * viewer's own switch for tip readings. `playLive` off plays only tests: Live
 * Studio must not sound off for rules firing on the creator's real stream.
 */
export function RuleAudio({ playLive }: { playLive: boolean }) {
  useRuleFired((fired) => {
    if (!isTipTtsEnabled() || (!fired.test && !playLive)) return;
    for (const id of fired.sounds) {
      const uri = RULE_SOUND_FILES[id];
      if (uri) playSound(uri);
    }
    for (const line of fired.say) speakTipMessage(line);
  });
  return null;
}
