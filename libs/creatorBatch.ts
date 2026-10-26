/** Submit sequentially; a failed or uncertain request must never trigger more spending. */
export async function runCreatorBatch<T>(quantity: number, options: {
  submit: () => Promise<T>;
  accept: (result: T) => Promise<boolean>;
  onError: (error: unknown) => Promise<void>;
  isCurrent: () => boolean;
}) {
  let submitted = 0;
  for (let i = 0; i < quantity && options.isCurrent(); i += 1) {
    submitted += 1;
    try {
      const result = await options.submit();
      if (!options.isCurrent() || !await options.accept(result)) break;
    } catch (error) {
      if (options.isCurrent()) await options.onError(error);
      break;
    }
  }
  return { submitted, remaining: quantity - submitted };
}
