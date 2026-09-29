/**
 * A failed portfolio lookup must fail, not succeed empty.
 * =======================================================
 * The Supabase client returns errors instead of throwing them, and every
 * balance read swallows its own failure to null. Together that made a dead
 * backend or a rate-limited RPC finish as a successful empty list: the
 * Portfolio tab said "You don't hold any fractions yet" to a holder, and the
 * empty result replaced their cached holdings.
 *
 * Pinned here: both position sources down, or every balance read down, rejects
 * the query. One source or one read failing still returns what is known.
 */

const mockBalanceOf = jest.fn();
const mockTables: Record<string, { data: any[] | null; error: any }> = {};

jest.mock("@tanstack/react-query", () => ({
  // Hand back the options so the test can run the queryFn directly.
  useQuery: (options: any) => options,
}));

jest.mock("ethers", () => ({
  ethers: {
    Contract: jest.fn().mockImplementation(() => ({ balanceOf: (...args: any[]) => mockBalanceOf(...args) })),
  },
}));

jest.mock("../../services/supabase", () => ({
  supabase: {
    from: (table: string) => {
      let source = table === "fraction_trades" ? "trades" : "listings";
      const builder: any = {
        select: () => builder,
        or: () => builder,
        ilike: () => {
          source = "ownListings";
          return builder;
        },
        limit: () => Promise.resolve(mockTables[source]),
      };
      return builder;
    },
  },
}));

jest.mock("../../services/ethers.service", () => ({
  ethersService: { getProvider: () => ({}) },
}));

jest.mock("../../services/user.service", () => ({
  getMyPosts: jest.fn(() => Promise.resolve({ result: [] })),
}));

jest.mock("../../libs/misc", () => ({ buildImageUrl: () => null }));

jest.mock("../../config/web3.constants", () => ({
  STREAM_COLLECTION_CONTRACT_ADDRESSES: { 8453: "0xcollection" },
}));

jest.mock("../../hooks/useFractionMarket", () => ({
  DEFAULT_FRACTION_CHAIN: 8453,
  TOTAL_FRACTIONS: 1000,
  // Someone else's wallet, so the /myPosts half stays out of these cases.
  useFractionWallet: () => "0xviewer",
}));

import { useFractionPortfolio } from "../../hooks/useFractionPortfolio";

const HOLDER = "0xholder";
const ok = (rows: any[]) => ({ data: rows, error: null });
const failed = () => ({ data: null, error: new Error("network") });
const row = (tokenId: number) => ({ token_id: tokenId, chain_id: 8453 });
const bn = (n: number) => ({ toNumber: () => n });

function runQuery() {
  const options: any = useFractionPortfolio(HOLDER);
  return options.queryFn();
}

beforeEach(() => {
  mockBalanceOf.mockReset();
  mockTables.trades = ok([]);
  mockTables.ownListings = ok([]);
  mockTables.listings = ok([]);
});

describe("useFractionPortfolio", () => {
  it("rejects when both position sources fail", async () => {
    mockTables.trades = failed();
    mockTables.ownListings = failed();

    await expect(runQuery()).rejects.toBeTruthy();
    expect(mockBalanceOf).not.toHaveBeenCalled();
  });

  it("keeps going when only one position source fails", async () => {
    mockTables.trades = failed();
    mockTables.ownListings = ok([row(7)]);
    mockBalanceOf.mockResolvedValue(bn(250));

    const positions = await runQuery();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ tokenId: "7", balance: 250, percentage: 25 });
  });

  it("rejects when every balance read fails", async () => {
    mockTables.trades = ok([row(1), row(2)]);
    mockBalanceOf.mockRejectedValue(new Error("429"));

    await expect(runQuery()).rejects.toThrow("Fraction balance reads failed");
  });

  it("skips a single failed read instead of blanking the list", async () => {
    mockTables.trades = ok([row(1), row(2)]);
    mockBalanceOf.mockImplementation((_address: string, tokenId: string) =>
      tokenId === "1" ? Promise.reject(new Error("timeout")) : Promise.resolve(bn(40)),
    );

    const positions = await runQuery();
    expect(positions.map((p: any) => p.tokenId)).toEqual(["2"]);
  });

  it("still returns an honest empty list when there is nothing to read", async () => {
    await expect(runQuery()).resolves.toEqual([]);
  });

  it("drops real zero balances without treating them as failures", async () => {
    mockTables.trades = ok([row(1), row(2)]);
    mockBalanceOf.mockResolvedValue(bn(0));

    await expect(runQuery()).resolves.toEqual([]);
  });
});
