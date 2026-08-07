import { unwrapUploadResponse, formatUploadErrorMessage } from '../../libs/xhr-upload';

describe('unwrapUploadResponse', () => {
  it('unwraps { result: … } envelopes', () => {
    const payload = {
      isSolana: true,
      createdTokenId: 42,
      transaction: 'abc',
      mintAddress: 'mint',
    };
    expect(unwrapUploadResponse({ result: payload })).toEqual(payload);
  });

  it('unwraps { data: { result: … } } envelopes', () => {
    const payload = { createdTokenId: 7, v: 28, r: '0x1', s: '0x2' };
    expect(unwrapUploadResponse({ data: { result: payload } })).toEqual(payload);
  });

  it('returns flat payloads unchanged', () => {
    const payload = { createdTokenId: 9 };
    expect(unwrapUploadResponse(payload)).toEqual(payload);
  });

  it('can skip unwrapping when unwrapResult is false', () => {
    const wrapped = { result: { createdTokenId: 1 } };
    expect(unwrapUploadResponse(wrapped, false)).toEqual(wrapped);
  });
});

describe('formatUploadErrorMessage', () => {
  it('detects Solana RPC rate limits in the error field', () => {
    const body = {
      message: 'Failed to mint NFT',
      error: '429 Too Many Requests: {"code":429,"message":"Connection rate limits exceeded"}',
    };
    expect(formatUploadErrorMessage(body, 'Upload failed')).toMatch(/rpc rate limit/i);
  });
});
