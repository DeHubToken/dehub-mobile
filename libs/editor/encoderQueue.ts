export function waitForEncoderCapacity(
  encoder: { readonly encodeQueueSize: number },
  maximumPending: number,
  check: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const poll = () => {
      try {
        check();
        if (encoder.encodeQueueSize < maximumPending) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

export const ENCODER_QUEUE_RUNTIME = waitForEncoderCapacity.toString();
