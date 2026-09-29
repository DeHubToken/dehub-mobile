// A failed tips or PPV read has to reach react-query as an error. Returning []
// made the Command Centre say "No income in this period" whenever the read
// failed, and a failed refresh replaced income that was already on screen.

// useQuery hands back its options so each test can run the queryFn directly.
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: any) => options }));

// Everything a jest.mock factory closes over has to be named mock*.
const mockResults: Record<string, { data: any; error: any }> = {};

jest.mock("../../services/supabase", () => ({
  supabase: {
    // Every builder method returns the builder, and the builder is thenable,
    // like supabase-js: the awaited chain resolves to that table's result.
    from: (table: string) => {
      const q: any = {};
      for (const m of ["select", "eq", "or", "order", "limit"]) q[m] = () => q;
      q.then = (resolve: any, reject: any) =>
        Promise.resolve(mockResults[table]).then(resolve, reject);
      return q;
    },
  },
}));
jest.mock("../../context/AuthContext", () => ({ useUser: () => ({ walletAddress: "0xABC" }) }));
jest.mock("../../services/subscription.service", () => ({
  getMySubscriptions: jest.fn(),
  getPlans: jest.fn(),
}));
jest.mock("../../services/dpay.service", () => ({ getDpayTnx: jest.fn(async () => null) }));
jest.mock("../../libs/logger", () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { usePpvSales, useRecentActivity, useTipsReceived } from "../../hooks/useCommandCentre";

const failure = { message: "network request failed", code: "" };
const tipRow = {
  id: 1,
  amount: 5,
  created_at: "2026-09-01T00:00:00Z",
  tx_hash: "0x1",
  sender_address: "0xdef",
  receiver_address: "0xabc",
};
const ppvRow = {
  id: 2,
  amount: 3,
  created_at: "2026-09-02T00:00:00Z",
  buyer_address: "0xdef",
  creator_address: "0xabc",
};

const queryFn = (hook: () => unknown) => (hook() as any).queryFn as () => Promise<any>;

beforeEach(() => {
  mockResults.tip_records = { data: [tipRow], error: null };
  mockResults.ppv_purchases = { data: [ppvRow], error: null };
});

describe("useTipsReceived", () => {
  it("returns the rows when the read succeeds", async () => {
    await expect(queryFn(useTipsReceived)()).resolves.toEqual([tipRow]);
  });

  it("throws when the read fails instead of reporting no tips", async () => {
    mockResults.tip_records = { data: null, error: failure };
    await expect(queryFn(useTipsReceived)()).rejects.toBe(failure);
  });
});

describe("usePpvSales", () => {
  it("returns the rows when the read succeeds", async () => {
    await expect(queryFn(usePpvSales)()).resolves.toEqual([ppvRow]);
  });

  it("throws when the read fails instead of reporting no sales", async () => {
    mockResults.ppv_purchases = { data: null, error: failure };
    await expect(queryFn(usePpvSales)()).rejects.toBe(failure);
  });
});

describe("useRecentActivity", () => {
  it("merges tips and PPV when both reads succeed", async () => {
    const items = await queryFn(useRecentActivity)();
    expect(items.map((i: any) => i.kind)).toEqual(["ppv-in", "tip-in"]);
  });

  it("throws when the tips read fails", async () => {
    mockResults.tip_records = { data: null, error: failure };
    await expect(queryFn(useRecentActivity)()).rejects.toBe(failure);
  });

  it("throws when the PPV read fails", async () => {
    mockResults.ppv_purchases = { data: null, error: failure };
    await expect(queryFn(useRecentActivity)()).rejects.toBe(failure);
  });
});
