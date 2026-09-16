import { useEffect, useState } from "react";
import { getAccountSummaries } from "../../services/user.service";

export interface PeerIdentity {
  name: string;
  avatarUrl: string | null;
}

function shorten(address: string): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

/**
 * Resolves the other side of a call to a username and avatar.
 *
 * The call screens used to carry a `// TODO: fetch username` and showed a
 * truncated wallet address for the whole call. `/account_info/batch` needs no
 * auth and takes one address happily, so there is no reason to answer a ringing
 * phone with `0x1234...abcd`. The shortened address stays as the fallback while
 * the request is in flight and if it fails.
 */
export function usePeerIdentity(peerAddress: string): PeerIdentity {
  const [identity, setIdentity] = useState<PeerIdentity>({
    name: shorten(peerAddress),
    avatarUrl: null,
  });

  useEffect(() => {
    let cancelled = false;
    setIdentity({ name: shorten(peerAddress), avatarUrl: null });
    if (!peerAddress) return;

    getAccountSummaries([peerAddress])
      .then((summaries) => {
        if (cancelled) return;
        const summary = summaries[0];
        if (!summary) return;
        const name = summary.username
          ? `@${summary.username}`
          : summary.displayName || shorten(peerAddress);
        setIdentity({ name, avatarUrl: summary.avatarImageUrl ?? null });
      })
      .catch(() => {
        /* the shortened address is a fine answer */
      });

    return () => {
      cancelled = true;
    };
  }, [peerAddress]);

  return identity;
}

export default usePeerIdentity;
