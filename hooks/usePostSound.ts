import { useState, useCallback } from "react";

export interface AttachedSound {
  url: string;
  title: string;
  creator: string;
  creatorAvatar?: string;
  tokenId: string;
  duration?: number;
}

export function usePostSound() {
  const [attachedSound, setAttachedSound] = useState<AttachedSound | null>(null);

  const selectSound = useCallback((sound: AttachedSound) => {
    setAttachedSound(sound);
  }, []);

  const clearSound = useCallback(() => {
    setAttachedSound(null);
  }, []);

  return { attachedSound, selectSound, clearSound };
}
