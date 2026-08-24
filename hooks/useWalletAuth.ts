// "Connect Wallet" sign-in — authenticates with an EXTERNAL wallet app
// (MetaMask, Trust Wallet, Coinbase Wallet, ...) via Reown AppKit/WalletConnect,
// instead of DeHub provisioning a local wallet (see identity-wallet.ts).
//
// An earlier version of this hook only tracked the connected address and
// called signInWithWallet directly — it never registered the connected
// wallet as the active SIGNING provider, so the personal_sign step inside
// signInWithWallet (see libs/web3.auth.sign.ts's getOrCreateAuthSignature)
// had nothing to sign with and would fail with "No signing provider
// available". setSigningProvider(walletProvider) below is what was missing:
// it's what makes the connected wallet the thing that actually signs the
// DeHub auth message.
import { useState, useCallback, useEffect, useRef } from "react";
import { toastError } from "../libs";
import { reportWalletSignupBlocked } from "../libs/walletSignupGate";
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit-ethers5-react-native";
import { useAuthActions } from "../context/AuthContext";
import { ChainId } from "../config/constants";
import { getPreferredChainId as getStoredPreferredChainId } from "../libs/auth.utils";
import { setSigningProvider, clearSigningProvider } from "../libs/provider.registry";
import { getAppKitInstance } from "../config/reown.config";
import { createLogger } from "../libs/logger";

const log = createLogger("useWalletAuth");

const getDefaultChainId = () => ChainId.BASE_MAINNET;

export const useWalletAuth = () => {
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  // True while AppKit's own wallet-picker sheet is on screen. AppKit renders
  // that sheet with react-native-modal's `coverScreen: false`, i.e. inline in
  // the app's root view (it is mounted next to the navigator in App.tsx)
  // rather than in a native modal window. Anything presented in a real RN
  // <Modal> — every GlassModal sheet, including the sign-in one that owns the
  // "Connect Wallet" button — therefore sits ABOVE it and swallows it, so the
  // wallet-brand list appears half-buried behind the sheet that opened it and
  // cannot be tapped. Callers that live inside a <Modal> use this to step out
  // of the way while the picker is up. Read through the AppKit instance rather
  // than useAppKitState() so this stays safe on a build where createAppKit
  // never ran (missing REOWN_PROJECT_ID — see reown.config).
  const [isWalletSheetOpen, setIsWalletSheetOpen] = useState(false);
  const { open } = useAppKit();
  const { address: accountAddress, chainId: currentChainId } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider();
  const { signInWithWallet } = useAuthActions();

  // Guards the auto-authenticate effect below from re-firing for the same
  // connection — AppKit's account/provider hooks can re-render several times
  // as a connection settles, and each render is not a new "the user connected".
  const authenticatedKeyRef = useRef<string | null>(null);

  // True only while THIS mount is actively waiting on a connection the user
  // just asked for via handleWalletConnect()'s open() call. AppKit persists
  // WalletConnect pairings across app restarts/screens, so on mount it can
  // report an already-connected account/provider from a stale prior pairing
  // (e.g. the user tried "Connect Wallet" once, long ago). Without this
  // guard, the auto-authenticate effect below would silently re-authenticate
  // against that stale external wallet — hijacking an unrelated Google/email
  // session with a Trust Wallet/MetaMask sign-in the user never asked for.
  const awaitingUserInitiatedConnectRef = useRef(false);

  useEffect(() => {
    const instance = getAppKitInstance();
    if (!instance) return;
    setIsWalletSheetOpen(!!instance.getState().open);
    return instance.subscribeStateKey("open", (value) => {
      setIsWalletSheetOpen(!!value);
    });
  }, []);

  const authenticateWithWallet = useCallback(
    async (address: string, chainId: number) => {
      if (!walletProvider) {
        log.warn("authenticate:no-provider");
        toastError(null, "Wallet connected but not ready to sign yet. Please try again.");
        return;
      }
      setIsWalletLoading(true);
      // Register the connected wallet as the signer BEFORE calling
      // signInWithWallet — see the file header for why this is required.
      setSigningProvider(walletProvider as any);
      try {
        const preferred = await getStoredPreferredChainId();
        const effectiveChainId = preferred ?? chainId ?? getDefaultChainId();
        await signInWithWallet(address, effectiveChainId);
        authenticatedKeyRef.current = `${address.toLowerCase()}-${chainId}`;
      } catch (error) {
        log.error("authenticate:error", error);
        if (!reportWalletSignupBlocked(error)) {
          toastError(error, "Wallet authentication failed. Please try again.");
        }
      } finally {
        clearSigningProvider();
        setIsWalletLoading(false);
      }
    },
    [walletProvider, signInWithWallet]
  );

  const handleWalletConnect = useCallback(async () => {
    // Already connected — authenticate immediately instead of reopening the
    // connect sheet. This is still an explicit tap, so mark it as
    // user-initiated too.
    if (accountAddress && currentChainId && walletProvider) {
      awaitingUserInitiatedConnectRef.current = true;
      await authenticateWithWallet(accountAddress, currentChainId);
      return;
    }
    awaitingUserInitiatedConnectRef.current = true;
    await open();
  }, [accountAddress, currentChainId, walletProvider, open, authenticateWithWallet]);

  // Once AppKit finishes connecting (address + chain + provider all become
  // available), authenticate automatically — the user already proved wallet
  // ownership by connecting; asking them to tap a second button would be a
  // redundant step the web flow doesn't have either.
  //
  // Gated on awaitingUserInitiatedConnectRef so this never fires just
  // because AppKit's own persisted session already has an address/provider
  // on mount (see comment on that ref above).
  useEffect(() => {
    if (!accountAddress || !currentChainId || !walletProvider) return;
    if (!awaitingUserInitiatedConnectRef.current) return;
    const key = `${accountAddress.toLowerCase()}-${currentChainId}`;
    if (authenticatedKeyRef.current === key) return;
    awaitingUserInitiatedConnectRef.current = false;
    authenticateWithWallet(accountAddress, currentChainId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, currentChainId, walletProvider]);

  return {
    isWalletLoading,
    isWalletSheetOpen,
    walletAddress: accountAddress ?? null,
    handleWalletConnect,
  };
};
