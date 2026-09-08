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
import { getPinnedTokenIds, togglePin } from "../services/pin.service";
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

export function useTogglePin() {
  const address = useMyAddress();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tokenId: number) => togglePin(tokenId),
    onSuccess: (data, tokenId) => {
      // Patch the list before refetching so the row's label flips with the
      // sheet still open, then reconcile with the server.
      queryClient.setQueryData<string[]>([PINNED_KEY, address], (old) => {
        if (old === undefined) return undefined;
        const id = String(tokenId);
        return data.pinned ? [...old.filter((x) => x !== id), id] : old.filter((x) => x !== id);
      });
      queryClient.invalidateQueries({ queryKey: [PINNED_KEY, address] });
      toastSuccess(
        data.pinned
          ? t("postOptions.postPinned", "Pinned to your profile")
          : t("postOptions.postUnpinned", "Unpinned from your profile"),
      );
    },
    onError: () => toastError(t("postOptions.pinFailed", "Could not pin or unpin this post")),
  });
}
