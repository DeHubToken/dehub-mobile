// The whole client flow against the real key manager, with the network, the
// signing provider and the keychain stubbed: two users set up identities from
// signatures, publish keys, seal messages to each other and open them; a peer
// without a key falls back to plaintext; a second device for the same wallet
// regenerates the same keys.
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => new Uint8Array(require("crypto").randomBytes(n)),
}));

const mockRegistry = new Map<string, string>();
let mockCaller = "";

jest.mock("../../libs/api.client", () => ({
  apiClient: {
    post: jest.fn(async (endpoint: string, body: any) => {
      if (endpoint !== "/dm/e2ee-key") throw new Error(`unexpected post ${endpoint}`);
      mockRegistry.set(mockCaller, body.publicKey);
      return { address: mockCaller, publicKey: body.publicKey };
    }),
    get: jest.fn(async (endpoint: string) => {
      const m = endpoint.match(/^\/dm\/e2ee-key\/(0x[0-9a-f]+)$/);
      if (!m) throw new Error(`unexpected get ${endpoint}`);
      return { address: m[1], publicKey: mockRegistry.get(m[1]) ?? null };
    }),
  },
}));

// A wallet that signs deterministically: the same text always gives the same
// bytes.
//
// The EOA slot starts EMPTY, which is what a returning session actually finds
// — the registry is only written during an interactive sign-in and cleared
// again straight after. It fills when something opens the wallet, so this
// covers the path whose absence left every returning session with no identity
// at all: sending in the clear and unable to open a line.
let mockEoaProvider: any = null;

const mockWallet = {
  request: async ({ method, params }: { method: string; params?: any[] }) => {
    if (method === "eth_accounts") return [];
    if (method === "dehub_openWallet") {
      mockEoaProvider = mockWallet;
      return true;
    }
    if (method === "personal_sign") {
      const [message, address] = params as [string, string];
      return "0x" + Buffer.from(`${address}:${message}`).toString("hex").padEnd(130, "0").slice(0, 130);
    }
    throw new Error(`unexpected ${method}`);
  },
};

jest.mock("../../libs/provider.registry", () => ({
  getSigningProvider: () => mockWallet,
  getEoaSigningProvider: () => mockEoaProvider,
  OPEN_WALLET_METHOD: "dehub_openWallet",
}));

import * as SecureStore from "expo-secure-store";
import {
  decryptFromPeer,
  decryptMessageInPlace,
  encryptForPeer,
  getIdentity,
  loadIdentity,
  prepareOutgoing,
  setupIdentity,
  unloadIdentity,
} from "../../libs/dm-e2ee/keys";
import { isEncryptedContent } from "../../libs/dm-e2ee/crypto";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C = "0xcccccccccccccccccccccccccccccccccccccccc";

async function wipeKeychain() {
  for (const a of [A, B, C]) {
    await SecureStore.deleteItemAsync?.("dehub_dm_e2ee_" + a.replace(/[^a-z0-9]/g, ""));
  }
}

async function become(address: string) {
  mockCaller = address;
  unloadIdentity();
  if (!(await loadIdentity(address))) await setupIdentity(address);
  expect(getIdentity()?.address).toBe(address);
}

describe("dm-e2ee client flow", () => {
  beforeEach(async () => {
    mockRegistry.clear();
    unloadIdentity();
    await wipeKeychain();
  });

  it("two users exchange messages that only they can open", async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    expect(mockRegistry.get(A)).toBe(pubA);

    await become(B);
    const sealedByB = await encryptForPeer(A, "hi from B");
    expect(sealedByB && isEncryptedContent(sealedByB)).toBe(true);
    expect(await decryptFromPeer(A, sealedByB!)).toBe("hi from B");

    await become(A);
    expect(await decryptFromPeer(B, sealedByB!)).toBe("hi from B");
    const wire = await prepareOutgoing(B, "hi from A");
    expect(wire.encrypted).toBe(true);

    await become(C);
    expect(await decryptFromPeer(A, sealedByB!)).toBeNull();
    expect(await decryptFromPeer(B, sealedByB!)).toBeNull();
  });

  it("falls back to plaintext for a peer without a published key", async () => {
    await become(A);
    const wire = await prepareOutgoing(C, "hello stranger");
    expect(wire).toEqual({ content: "hello stranger", encrypted: false });
  });

  it("marks lines it cannot open instead of exposing the envelope", async () => {
    await become(A);
    await become(B);
    const sealed = (await encryptForPeer(A, "secret"))!;
    const opened = await decryptMessageInPlace({ content: sealed, replyTo: { content: sealed } }, A);
    expect(opened).toMatchObject({ content: "secret", encrypted: true, undecryptable: false, replyTo: { content: "secret" } });
    const blind = await decryptMessageInPlace({ content: sealed }, null);
    expect(blind).toMatchObject({ content: "", encrypted: true, undecryptable: true });
    expect(JSON.stringify(blind)).not.toContain(sealed.slice(6, 30));
  });

  it("a second device for the same wallet regenerates the same keys", async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    await become(B);
    const sealed = (await encryptForPeer(A, "for every device"))!;

    await wipeKeychain();
    unloadIdentity();
    mockCaller = A;
    expect(await loadIdentity(A)).toBe(false);
    await setupIdentity(A);
    expect(getIdentity()!.publicKey).toBe(pubA);
    expect(await decryptFromPeer(B, sealed)).toBe("for every device");
  });

  it("a returning session loads the stored identity without signing again", async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    unloadIdentity();
    expect(await loadIdentity(A)).toBe(true);
    expect(getIdentity()!.publicKey).toBe(pubA);
  });

  it("sets up on a session that has registered no signing provider yet", async () => {
    // The bug this covers: the EOA slot is empty on every session that did not
    // just sign in, setup threw "no signing provider", and the phone spent the
    // session sending in the clear and unable to open a single line.
    mockEoaProvider = null;
    mockCaller = A;
    await setupIdentity(A);
    expect(getIdentity()?.address).toBe(A);
    expect(mockRegistry.get(A)).toBe(getIdentity()!.publicKey);
  });

  it("ignores a v1 keychain record rather than reusing a key web cannot match", async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    const key = "dehub_dm_e2ee_" + A.replace(/[^a-z0-9]/g, "");
    const stored = JSON.parse((await SecureStore.getItemAsync(key))!);
    await SecureStore.setItemAsync(key, JSON.stringify({ ...stored, v: 1 }));

    unloadIdentity();
    expect(await loadIdentity(A)).toBe(false);
    // Re-derives from the same signature, so the key is the same one — the
    // point is that the old record is not trusted, not that the key changes.
    await setupIdentity(A);
    expect(getIdentity()!.publicKey).toBe(pubA);
  });
});
