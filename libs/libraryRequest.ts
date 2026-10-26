/** A stalled connection must not hold library controls indefinitely. */
export async function libraryRequest<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Library request timed out')), 30_000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
