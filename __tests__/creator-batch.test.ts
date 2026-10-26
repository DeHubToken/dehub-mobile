import { runCreatorBatch } from '../libs/creatorBatch';

describe('Creator image batches', () => {
  it('keeps the completed output and stops at the first rejection', async () => {
    const submit = jest.fn().mockResolvedValueOnce({ url: 'saved' }).mockResolvedValueOnce({ error: 'blocked' });
    const outputs: string[] = [];
    const result = await runCreatorBatch<{ url?: string; error?: string }>(4, { submit, isCurrent: () => true, onError: async () => {},
      accept: async result => { if (result.error || !result.url) return false; outputs.push(result.url); return true; } });
    expect(outputs).toEqual(['saved']);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ submitted: 2, remaining: 2 });
  });
  it('does not spend again after an uncertain network failure', async () => {
    const submit = jest.fn().mockRejectedValue(new Error('timeout'));
    const onError = jest.fn(async () => {});
    expect(await runCreatorBatch(4, { submit, accept: async () => true, onError, isCurrent: () => true })).toEqual({ submitted: 1, remaining: 3 });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('stops and does not deliver into another account or conversation', async () => {
    let current = true;
    const accept = jest.fn(async () => true);
    const submit = jest.fn(async () => { current = false; return { url: 'archived-server-side' }; });
    expect(await runCreatorBatch(3, { submit, accept, onError: async () => {}, isCurrent: () => current })).toEqual({ submitted: 1, remaining: 2 });
    expect(accept).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
