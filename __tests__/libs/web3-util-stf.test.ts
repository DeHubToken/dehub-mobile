import { parseTxError } from "../../libs/web3.util";

// The exact payload Pimlico returned for the reported failures, copied from the
// dashboard request log. Error(string) selector 0x08c379a0, offset 0x20,
// length 3, "STF" — the DHB pull failing, nothing to do with sponsorship.
const PIMLICO_STF_HEX =
  "0x08c379a0" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000003" +
  "5354460000000000000000000000000000000000000000000000000000000000";

/**
 * A userOp error as viem actually builds it: the readable reason lives on
 * `details`, while `message` is the whole request body — which is why the word
 * "paymaster" is in here even though the paymaster is fine.
 */
function userOpError(reasonHex: string) {
  const err: any = new Error(
    "UserOperation reverted during simulation with reason: " +
      reasonHex +
      "\nRequest body: {\"method\":\"eth_estimateUserOperationGas\"," +
      "\"params\":[{\"paymaster\":\"0x0000000000000000000000000000000000000000\"}]}" +
      "\nURL: https://api.pimlico.io/v2/8453/rpc",
  );
  err.details = "UserOperation reverted during simulation with reason: " + reasonHex;
  err.shortMessage = "UserOperation reverted during simulation.";
  return err;
}

describe("parseTxError — an STF revert is not a sponsorship outage", () => {
  it("names the token transfer, not the paymaster", () => {
    expect(parseTxError(userOpError(PIMLICO_STF_HEX), "send")).toBe(
      "Token transfer failed — check your DHB balance and approval",
    );
  });

  it("does not report sponsorship trouble for it", () => {
    const out = parseTxError(userOpError(PIMLICO_STF_HEX), "send");
    expect(out.toLowerCase()).not.toContain("sponsor");
    expect(out.toLowerCase()).not.toContain("paymaster");
  });

  it("matches the bare hex when nothing decoded it", () => {
    const err: any = new Error("reverted: 535446 paymaster api.pimlico.io");
    expect(parseTxError(err, "send")).toBe(
      "Token transfer failed — check your DHB balance and approval",
    );
  });

  it("reads a reason that only viem exposes on cause", () => {
    const err: any = new Error("UserOperation failed. paymaster: 0x0");
    err.cause = { reason: "STF" };
    expect(parseTxError(err, "send")).toBe(
      "Token transfer failed — check your DHB balance and approval",
    );
  });

  it("still reports a real sponsorship failure as one", () => {
    const err: any = new Error(
      "Insufficient Pimlico balance for sponsorship, please top up",
    );
    expect(parseTxError(err, "send").toLowerCase()).toContain("sponsor");
  });

  it("still recognises a plain user rejection", () => {
    const err: any = new Error("user rejected the request");
    expect(parseTxError(err, "send")).toBe("You rejected the transaction");
  });

  it("still recognises a locked wallet", () => {
    const err: any = new Error("wallet is locked");
    expect(parseTxError(err, "send")).toBe(
      "Your wallet is locked — unlock it to continue",
    );
  });

  it("surfaces a non-STF revert reason instead of blaming the paymaster", () => {
    const err: any = new Error("execution reverted: Deadline expired paymaster");
    expect(parseTxError(err, "send")).toBe("Deadline expired paymaster");
  });
});
