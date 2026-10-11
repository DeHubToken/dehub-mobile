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

export const ENCODER_QUEUE_RUNTIME = String.raw`function waitForEncoderCapacity(encoder, maximumPending, check) {
  return new Promise(function (resolve, reject) {
    function poll() {
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
    }
    poll();
  });
}`;
