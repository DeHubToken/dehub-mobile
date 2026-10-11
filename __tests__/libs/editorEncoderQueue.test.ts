import { waitForEncoderCapacity, ENCODER_QUEUE_RUNTIME } from "../../libs/editor/encoderQueue";

const runtimeWait = new Function("return (" + ENCODER_QUEUE_RUNTIME + ")")() as typeof waitForEncoderCapacity;
for (const [name, wait] of [["module", waitForEncoderCapacity], ["canvas runtime", runtimeWait]] as const) {
  describe(name, () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    it("keeps waiting when the codec remains full across event-loop turns", async () => {
      const encoder = { encodeQueueSize: 8 }; let ready = false;
      const result = wait(encoder, 8, () => {}).then(() => { ready = true; });
      await jest.advanceTimersByTimeAsync(40);
      expect(ready).toBe(false);
      encoder.encodeQueueSize = 7;
      await jest.advanceTimersByTimeAsync(10); await result;
      expect(ready).toBe(true); expect(jest.getTimerCount()).toBe(0);
    });
    it("retains the codec failure when closing resets the pending count", async () => {
      const encoder = { encodeQueueSize: 8 }; let failure: Error | undefined;
      const result = wait(encoder, 8, () => { if (failure) throw failure; }).then(() => undefined, error => error);
      failure = new Error("Encoder lost its device"); encoder.encodeQueueSize = 0;
      await jest.advanceTimersByTimeAsync(10);
      expect(await result).toBe(failure); expect(jest.getTimerCount()).toBe(0);
    });
    it("cancels a stalled queue without waiting for codec output", async () => {
      const encoder = { encodeQueueSize: 8 }; let job = "first";
      const aborted = new Error("Export cancelled");
      const result = wait(encoder, 8, () => { if (job !== "first") throw aborted; }).then(() => undefined, error => error);
      job = "second";
      await jest.advanceTimersByTimeAsync(10);
      expect(await result).toBe(aborted); expect(encoder.encodeQueueSize).toBe(8); expect(jest.getTimerCount()).toBe(0);
    });
    it.each([6, 8])("retains all 120 timestamps with at most %i pending requests", async limit => {
      const encoder = { encodeQueueSize: 0 }; const output: number[] = []; let peak = 0;
      const produce = async () => {
        for (let timestamp = 0; timestamp < 120; timestamp++) {
          encoder.encodeQueueSize++; peak = Math.max(peak, encoder.encodeQueueSize);
          setTimeout(() => { encoder.encodeQueueSize--; output.push(timestamp); }, 30);
          await wait(encoder, limit, () => {});
        }
      };
      const result = produce(); await jest.runAllTimersAsync(); await result;
      expect(peak).toBe(limit); expect(output).toEqual(Array.from({ length: 120 }, (_, i) => i));
      expect(encoder.encodeQueueSize).toBe(0); expect(jest.getTimerCount()).toBe(0);
    });
  });
}
