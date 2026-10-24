jest.mock('../../libs/token-refresh', () => ({ tokenRefreshManager: { ensureFreshToken: jest.fn().mockResolvedValue(undefined) } }));
import { AIServiceError, generateImage, isPaymentRequired } from '../../services/ai.service';

afterEach(() => jest.restoreAllMocks());

it.each([
  { status: 500, error: 'Image generation failed (403). {"detail":"User is locked. Reason: TOP_UP"}' },
  { status: 503, error: 'Image generation is temporarily unavailable.', code: 'IMAGE_PROVIDER_UNAVAILABLE' },
  { status: 200, error: 'User is locked. Reason: TOP_UP' },
])('keeps provider billing failures out of customer login and payment flows: $status', async ({ status, ...body }) => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);
  let failure: unknown;
  try { await generateImage({ prompt: 'Edit the logo', model: 'gemini-2.5-flash' }); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AIServiceError);
  expect(failure).toMatchObject({ status: 503, errorCode: 'IMAGE_PROVIDER_UNAVAILABLE' });
  expect((failure as Error).message).not.toMatch(/TOP_UP|locked/);
  expect(isPaymentRequired(failure)).toBe(false);
});

it('keeps successful backup output and editing inputs on the single paid request', async () => {
  const output = { success: true, imageUrl: 'https://output.invalid/edit.png', text: '',
    provider: 'lovable', model: 'google/gemini-3.1-flash-image', requestedModel: 'flux-3-image', fallbackUsed: true };
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => output } as Response);
  const input = { prompt: 'Edit the logo', model: 'gemini-2.5-flash' as const,
    sourceImage: 'data:image/png;base64,fixture', referenceImageUrls: ['https://input.invalid/second.png'] };
  await expect(generateImage(input)).resolves.toEqual(output);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject(input);
});

it('preserves real customer payment failures', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 402,
    json: async () => ({ error: 'Not enough DHB credit', code: 'PAYMENT_REQUIRED' }) } as Response);
  let failure: unknown;
  try { await generateImage({ prompt: 'A church', model: 'gemini-2.5-flash' }); } catch (error) { failure = error; }
  expect(isPaymentRequired(failure)).toBe(true);
});
