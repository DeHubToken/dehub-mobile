// Centralized Web3Auth configuration & helpers
// Keep ALL Web3Auth specific setup in this module and only export the minimal
// surface needed elsewhere. This avoids scattering config across the codebase.

// NOTE: The @web3auth/react-native-sdk types can vary by version. To keep this
// module resilient, we use soft typing (any) where upstream types are unstable.
// Use require to avoid TypeScript named export mismatch issues with current SDK version
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Web3Auth } = require('@web3auth/react-native-sdk');

type LoginProvider = string; // Narrow later if you add explicit union
// We avoid importing specific enums that may have changed; use literal strings.

import env from './env';
import { ChainId } from './constants';
import { SUPPORTED_NETWORKS, appScheme } from './web3.constants';

// --- Environment & Constants -------------------------------------------------
// You can map these to process.env.* (already done in env.ts). Add WEB3AUTH vars there when available.
// For now we allow override via process.env to keep flexibility.
export const WEB3AUTH_CLIENT_ID: string = env.WEB3AUTH_CLIENT_ID || (process.env.WEB3AUTH_CLIENT_ID as string) || 'REPLACE_WITH_WEB3AUTH_CLIENT_ID';

// Redirect / Deep link scheme must match what's configured in Web3Auth dashboard & native project.
// If you change this, update AndroidManifest, iOS URL types, and Info.plist accordingly.
export const WEB3AUTH_DEEP_LINK_SCHEME = appScheme;
export const WEB3AUTH_REDIRECT_URL = `${appScheme}://auth`; // scheme must match native config

// Preferred network (MAINNET / SAPPHIRE_MAINNET / SAPPHIRE_DEVNET etc.)
export const WEB3AUTH_NETWORK_ENV = 'mainnet'; // switched from sapphire_mainnet due to runtime adapter error

// Chain configuration (EVM for now). Adjust chainId / rpc as needed.
// Using Base Mainnet by default; adjust if your primary chain differs.
// Prefer Base mainnet if available in configured networks; fallback to first entry.
const baseNet = (SUPPORTED_NETWORKS as any)[ChainId.BASE_MAINNET];
export const WEB3AUTH_CHAIN_ID = baseNet?.chainId || '0x2105';
export const WEB3AUTH_RPC_TARGET = baseNet?.rpcUrls?.[0] || 'https://mainnet.base.org';

// --- Social Provider Metadata ------------------------------------------------
// Icons (SVG) from assets/socials. For React Native we keep the raw XML string.
// If you later swap to <Image>, adjust consumers accordingly.
// Use actual SVG assets; require ensures compatibility without extra declarations.
// If using an svg transformer, you can switch to import syntax.
import { GOOGLE_SVG_XML, TWITTER_SVG_XML } from './socialIcons';

export interface SocialProviderMeta {
    provider: LoginProvider;
    name: string;
    icon: string; // raw SVG xml
}

export const SOCIAL_PROVIDERS: SocialProviderMeta[] = [
    { provider: 'google', name: 'Google', icon: GOOGLE_SVG_XML },
    { provider: 'twitter', name: 'Twitter', icon: TWITTER_SVG_XML },
];

// Helper map for quick lookup
export const SOCIAL_PROVIDER_MAP: Record<string, SocialProviderMeta> = SOCIAL_PROVIDERS.reduce(
    (acc, p) => ({ ...acc, [p.provider]: p }),
    {}
);

// --- Web3Auth Singleton ------------------------------------------------------
let web3authInstance: any | null = null;
let web3authInitPromise: Promise<any> | null = null;

const buildOptions = (override?: Partial<any>): any => {
    const opts = {
        clientId: WEB3AUTH_CLIENT_ID,
        network: WEB3AUTH_NETWORK_ENV,
        chainNamespace: 'eip155',
        redirectUrl: WEB3AUTH_REDIRECT_URL,
        // useCoreKitKey disabled to avoid adapter prototype issues in some versions
        // useCoreKitKey: true,
        sessionTime: 86400, // 1 day in seconds
        mfaLevel: 'none',
        chainConfig: {
            chainNamespace: 'eip155',
            chainId: WEB3AUTH_CHAIN_ID,
            rpcTarget: WEB3AUTH_RPC_TARGET,
            displayName: baseNet?.chainName || 'Base Mainnet',
            ticker: baseNet?.nativeCurrency?.symbol || 'ETH',
            tickerName: baseNet?.nativeCurrency?.name || 'Ether',
        },
        ...override,
    };
    return opts;
};

export const getWeb3Auth = async (): Promise<any> => {
    if (web3authInstance) return web3authInstance;
    if (web3authInitPromise) return web3authInitPromise;

    web3authInitPromise = (async () => {
        const options = buildOptions();
        console.log('[Web3Auth] Initializing with options', {
            clientId: options.clientId,
            network: options.network,
            redirectUrl: options.redirectUrl,
            chainId: options.chainConfig?.chainId,
        });
        const w3a = new Web3Auth(options);
        await w3a.init();
        console.log('[Web3Auth] init complete');
        web3authInstance = w3a;
        return w3a;
    })();

    try {
        return await web3authInitPromise;
    } finally {
        web3authInitPromise = null; // allow retry if it failed
    }
};

// --- Login / Logout Helpers --------------------------------------------------
export interface Web3AuthLoginResult {
    address: string | null;
    privateKey: string | null; // For custodial flows you might not expose this
    userInfo: any; // shape defined by Web3Auth
    provider: LoginProvider;
}

export const loginWithSocial = async (
    provider: LoginProvider
): Promise<Web3AuthLoginResult> => {
    const w3a = await getWeb3Auth();
    if (!w3a) throw new Error('Web3Auth instance is null');
    console.log('[Web3Auth] Instance ready. Network:', WEB3AUTH_NETWORK_ENV);
    let info: any;
    try {
        info = await w3a.login({ loginProvider: provider });
    } catch (err: any) {
        console.warn('[Web3Auth] First login attempt failed:', err?.message);
        throw new Error(err?.message || 'Web3Auth login failed');
    }

    // Extract private key (if needed). Avoid storing insecurely.
    let privateKey: string | null = null;
    try {
        try {
            privateKey = await (web3authInstance || w3a).getPrivKey();
        } catch (inner) {
            // fallback to original instance if swapped
            privateKey = await w3a.getPrivKey();
        }
    } catch (e) {
        // Some providers may not expose a priv key depending on config
        console.warn('Web3Auth getPrivKey unavailable:', e);
    }

    // Address derivation depends on usage of provider/adapter; some flows may require
    // deriving from privateKey via ethers. Keep it simple here; consumer can derive later.
    return {
        address: info?.userInfo?.wallets?.[0]?.address || null,
        privateKey,
        userInfo: info?.userInfo,
        provider,
    };
};

export const logoutWeb3Auth = async () => {
    if (!web3authInstance) return;
    try {
        await web3authInstance.logout();
    } catch (e) {
        console.warn('Web3Auth logout warning:', e);
    }
};

// --- Utility -----------------------------------------------------------------
export const isWeb3AuthConfigured = (): boolean => {
    return !!WEB3AUTH_CLIENT_ID && WEB3AUTH_CLIENT_ID !== 'REPLACE_WITH_WEB3AUTH_CLIENT_ID';
};

// --- Types to export to consumers --------------------------------------------
export type { LoginProvider };

// If needed later, we can expose an initialize function for early app startup.
export const ensureWeb3AuthReady = async () => {
    try {
        await getWeb3Auth();
    } catch (e) {
        console.error('Failed to initialize Web3Auth:', e);
    }
};

// Attempt to derive an address from a private key if Web3Auth didn't supply one.
export const deriveAddressFromPrivateKey = (privKey?: string | null): string | null => {
    if (!privKey) return null;
    try {
        const { Wallet } = require('ethers');
        const normalized = privKey.startsWith('0x') ? privKey : `0x${privKey}`;
        const wallet = new Wallet(normalized);
        return wallet.address;
    } catch (e) {
        console.warn('Failed to derive address from private key', e);
        return null;
    }
};

// NOTE: No side-effects executed on import besides lazy singleton creation to keep startup fast.
