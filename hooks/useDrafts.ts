/**
 * useDrafts
 *
 * Hook for persisting post drafts to AsyncStorage.
 * Media URIs may become stale if the underlying files are cleaned up by the OS,
 * but text, categories, and monetisation settings will always survive.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";

// ── Types ──────────────────────────────────────────────────

export interface Draft {
  id: string;
  bodyText: string;
  description: string;
  categories: string[];
  imageUris: string[];
  videoUri: string | null;
  thumbnailUri: string | null;
  coverUri: string | null;
  monetization: MonetizationState;
  createdAt: number; // epoch ms
}

// ── Constants ──────────────────────────────────────────────

const STORAGE_KEY = "@dhb_drafts";

// ── Helpers ────────────────────────────────────────────────

const generateId = (): string =>
  `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const readDrafts = async (): Promise<Draft[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeDrafts = async (drafts: Draft[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error("[useDrafts] write error:", e);
  }
};

// ── Hook ───────────────────────────────────────────────────

export function useDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  // Load drafts on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await readDrafts();
      if (mounted) {
        setDrafts(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /** Reload drafts from storage (useful after navigating back) */
  const reload = useCallback(async () => {
    const data = await readDrafts();
    setDrafts(data);
  }, []);

  /** Save a new draft and return its id */
  const saveDraft = useCallback(
    async (draft: Omit<Draft, "id" | "createdAt">): Promise<string> => {
      const id = generateId();
      const entry: Draft = { ...draft, id, createdAt: Date.now() };
      const updated = [entry, ...drafts];
      setDrafts(updated);
      await writeDrafts(updated);
      return id;
    },
    [drafts],
  );

  /** Delete a draft by id */
  const deleteDraft = useCallback(
    async (id: string): Promise<void> => {
      const updated = drafts.filter((d) => d.id !== id);
      setDrafts(updated);
      await writeDrafts(updated);
    },
    [drafts],
  );

  /** Delete all drafts */
  const clearAllDrafts = useCallback(async (): Promise<void> => {
    setDrafts([]);
    await writeDrafts([]);
  }, []);

  return {
    drafts,
    loading,
    reload,
    saveDraft,
    deleteDraft,
    clearAllDrafts,
  };
}
