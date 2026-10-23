jest.mock("../../libs/dao-treasury", () => ({
  rpcUrlFor: jest.fn(async () => "https://rpc.example"),
  rpc: jest.fn(),
}));
jest.mock("../../config/web3.constants", () => ({ STREAM_COLLECTION_CONTRACT_ADDRESSES: { 8453: "0xcontract" } }));

import { rpc } from "../../libs/dao-treasury";
import { getTokenHolders } from "../../libs/token-holders";

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const topic = (addr: string) => `0x${addr.replace(/^0x/, "").padStart(64, "0")}`;
const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const C = "0x" + "c".repeat(40);

describe("getTokenHolders", () => {
  it("reads holders of this token from transfers and ranks by balance", async () => {
    (rpc as jest.Mock).mockImplementation(async (_url: string, method: string, params: any[]) => {
      if (method === "eth_blockNumber") return "0x100000";
      if (method === "eth_getLogs") {
        return [
          { topics: ["0x", topic(A), topic("0x0"), topic(A)], data: `0x${word(42)}${word(1000)}` },
          { topics: ["0x", topic(A), topic(A), topic(B)], data: `0x${word(42)}${word(300)}` },
          { topics: ["0x", topic(A), topic(A), topic(C)], data: `0x${word(7)}${word(5)}` },
        ];
      }
      const data: string = params[0].data;
      if (data.includes("a".repeat(40))) return `0x${word(700)}`;
      if (data.includes("b".repeat(40))) return `0x${word(300)}`;
      return `0x${word(0)}`;
    });
    const holders = await getTokenHolders(42);
    expect(holders).toEqual([
      { address: A, balance: 700, percentage: 70 },
      { address: B, balance: 300, percentage: 30 },
    ]);
  });
});
