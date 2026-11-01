/**
 * Which posts the signed-in account has pinned, and the toggle for it.
 *
 * One shared query answers "is this pinned" for every card on screen, so the
 * pin row in a post's three-dot menu opens already showing the right label
 * instead of guessing "not pinned" and offering to pin something that already
 * is. Web does the same through `usePinnedPostIds`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "i18next";
import { getPinCount, getPinnedPosts, getPinnedTokenIds, getPinners, togglePin } from "../services/pin.service";
import { useUser } from "../context/AuthContext";
import { toastError, toastSuccess } from "../libs/toast";

const PINNED_KEY = "pinned-posts";

function useMyAddress(): string {
  const user = useUser();
  return ((user?.walletAddress || user?.address || "") as string).toLowerCase();
}

export function usePinnedPostIds() {
  const address = useMyAddress();

  return useQuery<string[]>({
    queryKey: [PINNED_KEY, address],
    queryFn: () => getPinnedTokenIds(address),
    enabled: Boolean(address),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

/** Whether the viewer has pinned this post. */
export function useIsPostPinned(tokenId?: number | string | null): boolean {
  const { data } = usePinnedPostIds();
  if (tokenId == null) return false;
  return (data || []).includes(String(tokenId));
}

/**
 * The posts an account has pinned, newest pin first. The profile's Pinned tab
 * and the pinned rows at the top of its All tab both read this one query, so
 * a pin or unpin from any three-dot menu shows on both at once.
 */
export function useProfilePins(address?: string) {
  const key = (address || "").toLowerCase();
  return useQuery<any[]>({
    queryKey: [PINNED_KEY, "list", key],
    queryFn: () => getPinnedPosts(key),
    enabled: Boolean(key),
    staleTime: 60 * 1000,
  });
}

/** What to pin: the token id, plus the post itself so it can show at once. */
export type TogglePinInput = number | { tokenId: number; post?: any };

export function useTogglePin() {
  const address = useMyAddress();
  const queryClient = useQueryClient();
  const idsKey = [PINNED_KEY, address];
  const listKey = [PINNED_KEY, "list", address];

  const apply = (tokenId: number, pinned: boolean, post?: any) => {
    const id = String(tokenId);
    queryClient.setQueryData<string[]>(idsKey, (old) => {
      const base = (old || []).filter((x) => x !== id);
      return pinned ? [...base, id] : base;
    });
    queryClient.setQueryData<any[]>(listKey, (old) => {
      if (old === undefined && !pinned) return undefined;
      const base = (old || []).filter((p) => String(p?.tokenId) !== id);
      if (!pinned) return base;
      const existing = (old || []).find((p) => String(p?.tokenId) === id);
      const row = existing || post;
      return row ? [{ ...row, tokenId: row.tokenId ?? tokenId }, ...base] : old;
    });
  };

  return useMutation({
    mutationFn: (input: TogglePinInput) => togglePin(typeof input === "number" ? input : input.tokenId),
    // Flip before the request goes out, so the post lands at the top of the
    // profile (or leaves it) the moment the row is tapped.
    onMutate: async (input: TogglePinInput) => {
      const tokenId = typeof input === "number" ? input : input.tokenId;
      const post = typeof input === "number" ? undefined : input.post;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: idsKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);
      const previousIds = queryClient.getQueryData<string[]>(idsKey);
      const previousList = queryClient.getQueryData<any[]>(listKey);
      const wasPinned = (previousIds || []).includes(String(tokenId));
      apply(tokenId, !wasPinned, post);
      return { previousIds, previousList };
    },
    onSuccess: (data, input) => {
      const tokenId = typeof input === "number" ? input : input.tokenId;
      const post = typeof input === "number" ? undefined : input.post;
      // The server's toggle decides; settle on its answer, then reconcile.
      apply(tokenId, !!data?.pinned, post);
      queryClient.invalidateQueries({ queryKey: idsKey });
      queryClient.invalidateQueries({ queryKey: listKey });
      // This post's count moves by one; its pinners list is refetched.
      queryClient.setQueryData<number>([PINNED_KEY, "count", tokenId], (old) =>
        old === undefined ? undefined : Math.max(0, old + (data.pinned ? 1 : -1)),
      );
      queryClient.invalidateQueries({ queryKey: [PINNED_KEY, "users", tokenId] });
      toastSuccess(
        data.pinned
          ? t("postOptions.postPinned", "Pinned to your profile")
          : t("postOptions.postUnpinned", "Unpinned from your profile"),
      );
    },
    onError: (_err, _input, context) => {
      queryClient.setQueryData(idsKey, context?.previousIds);
      queryClient.setQueryData(listKey, context?.previousList);
      toastError(t("postOptions.pinFailed", "Could not pin or unpin this post"));
    },
  });
}

/** How many accounts have pinned this post. */
export function usePinCount(tokenId?: number | null) {
  return useQuery<number>({
    queryKey: [PINNED_KEY, "count", tokenId],
    queryFn: () => getPinCount(tokenId as number),
    enabled: !!tokenId,
    staleTime: 5 * 60 * 1000,
  });
}

/** The first page of accounts that pinned this post. */
export function usePinners(tokenId?: number | null) {
  return useQuery({
    queryKey: [PINNED_KEY, "users", tokenId],
    queryFn: () => getPinners(tokenId as number),
    enabled: !!tokenId,
    staleTime: 2 * 60 * 1000,
  });
}
