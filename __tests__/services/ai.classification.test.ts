/**
 * The assistant's request classification.
 *
 * These are the phrase lists dehubweb's AssistantPage.tsx routes on, and the
 * point of the tests is that they keep agreeing with it. If a sentence
 * classifies differently here, the same prompt opens a paywall on the desktop
 * and gets a chat reply on a phone — or worse, the other way round.
 */

import {
  buildDeHubBrandPrompt,
  describeTools,
  detectAiToolRequest,
  isCreativeLogoRequest,
  isDeHubBrandedImageRequest,
  isImageRequest,
  isVideoRequest,
  requiresLogoAsset,
  isSupportQuestion,
  AIServiceError,
  isPaymentRequired,
  dehubAuthHeaders,
} from '../../services/ai.service';
import { setAuthToken, removeAuthToken } from '../../libs/auth.utils';

describe('services/ai.service — request classification', () => {
  describe('isVideoRequest', () => {
    it.each([
      'generate a video of a husky',
      'animate this',
      'bring to life',
      'turn this into a clip',
      'make it move',
    ])('routes %p to video', (text) => {
      expect(isVideoRequest(text)).toBe(true);
    });

    it('leaves ordinary chat alone', () => {
      expect(isVideoRequest('who is top of the leaderboard?')).toBe(false);
    });
  });

  describe('isImageRequest', () => {
    it.each([
      'generate an image of a husky',
      'photo of a sunset',
      'draw me a logo concept',
      'what does a DeHub poster look like',
      'visualize the roadmap',
    ])('routes %p to image', (text) => {
      expect(isImageRequest(text)).toBe(true);
    });

    // A video phrase wins: half of them also match an image keyword, and
    // charging for an image when someone asked for a video is the wrong error.
    it('yields to a video request', () => {
      expect(isImageRequest('animate this picture')).toBe(false);
      expect(isImageRequest('turn this into a video')).toBe(false);
    });

    it('treats an attachment plus any instruction as an edit', () => {
      expect(isImageRequest('remove the sky', true)).toBe(true);
      expect(isImageRequest('remove the sky', false)).toBe(false);
    });

    it('still yields to video even with an attachment', () => {
      expect(isImageRequest('animate this', true)).toBe(false);
    });

    it('leaves ordinary chat alone', () => {
      expect(isImageRequest('how much DHB have I earned?')).toBe(false);
    });
  });

  describe('logo handling', () => {
    it('detects a logo request', () => {
      expect(requiresLogoAsset('show me the dehub logo')).toBe(true);
      expect(requiresLogoAsset('what is DeHub?')).toBe(false);
    });

    // "Show me the logo" displays the bundled asset. Anything more elaborate
    // pays a model to composite it.
    it.each(['show me the logo', 'dehub logo', 'the official logo', 'display the dehub logo'])(
      'treats %p as a plain display',
      (text) => {
        expect(isCreativeLogoRequest(text)).toBe(false);
      },
    );

    it('treats a logo in a composition as creative', () => {
      expect(isCreativeLogoRequest('put the dehub logo on a mountain at sunset')).toBe(true);
    });
  });

  describe('isDeHubBrandedImageRequest', () => {
    it('needs both the brand and a content noun', () => {
      expect(isDeHubBrandedImageRequest('make a DeHub banner for the LCS launch')).toBe(true);
      expect(isDeHubBrandedImageRequest('a dhb promo card')).toBe(true);
      // Brand with no content noun is a question, not a poster.
      expect(isDeHubBrandedImageRequest('what is DeHub building next?')).toBe(false);
      // Content noun with no brand is an ordinary image request.
      expect(isDeHubBrandedImageRequest('make a poster of a husky')).toBe(false);
    });

    it('matches "de hub" written as two words', () => {
      expect(isDeHubBrandedImageRequest('de hub banner')).toBe(true);
    });
  });

  describe('detectAiToolRequest', () => {
    it('picks the tool category', () => {
      expect(detectAiToolRequest('write me a song about winter', false)).toBe('music');
      expect(detectAiToolRequest('read this aloud', false)).toBe('tts');
      expect(detectAiToolRequest('transcribe this', false)).toBe('speech-to-text');
    });

    // Both of these need something to operate on, so without an image they are
    // ordinary chat rather than a charge for nothing.
    it('gates the image tools on having an image', () => {
      expect(detectAiToolRequest('remove the background', false)).toBeNull();
      expect(detectAiToolRequest('remove the background', true)).toBe('background-removal');
      expect(detectAiToolRequest('upscale this', false)).toBeNull();
      expect(detectAiToolRequest('upscale this', true)).toBe('upscale');
    });

    it('returns null for ordinary chat', () => {
      expect(detectAiToolRequest('who is live right now?', false)).toBeNull();
    });
  });

  describe('describeTools', () => {
    it('names a known tool', () => {
      expect(describeTools(['lookup_user'])).toBe('Looking up that profile…');
    });

    it('counts the rest', () => {
      expect(describeTools(['my_wallet', 'my_earnings'])).toBe(
        'Checking your wallet (+1 more)…',
      );
    });

    // A tool added server-side goes live with no client release, so an unknown
    // key has to read sensibly rather than showing a raw identifier.
    it('falls back to the raw name', () => {
      expect(describeTools(['brand_new_tool'])).toBe('Running brand new tool…');
    });

    it('is empty with no tools', () => {
      expect(describeTools([])).toBe('');
    });
  });

  describe('buildDeHubBrandPrompt', () => {
    it('wraps the request in the brand system', () => {
      const prompt = buildDeHubBrandPrompt('a banner for the token launch');
      expect(prompt).toContain('DEHUB BRAND SYSTEM (mandatory)');
      expect(prompt).toContain('Exo / Exo 2');
      expect(prompt).toContain('Never use blue');
      expect(prompt).toContain('USER REQUEST: a banner for the token launch');
    });
  });

  describe('isPaymentRequired', () => {
    it('recognises a 402 from the payment guard', () => {
      expect(isPaymentRequired(new AIServiceError('nope', 402))).toBe(true);
      expect(
        isPaymentRequired(new AIServiceError('nope', 400, 'PAYMENT_EXHAUSTED')),
      ).toBe(true);
      expect(
        isPaymentRequired(new Error('This generation costs DHB. Pay for it and pass the transfer hash.')),
      ).toBe(true);
    });

    it('does not mistake other failures for a payment problem', () => {
      expect(isPaymentRequired(new AIServiceError('bad prompt', 400))).toBe(false);
      expect(isPaymentRequired(new Error('network down'))).toBe(false);
    });
  });

  describe('dehubAuthHeaders', () => {
    afterEach(async () => {
      await removeAuthToken();
    });

    // Without these the paid functions answer 401 — which is what used to
    // happen after the paywall had already taken the money.
    it('carries the token and the wallet', async () => {
      await setAuthToken('token-123');
      const headers = await dehubAuthHeaders('0xAbCdEf0000000000000000000000000000000001');
      expect(headers['x-dehub-token']).toBe('token-123');
      expect(headers['x-wallet-address']).toBe('0xabcdef0000000000000000000000000000000001');
    });

    it('omits the wallet when none is known', async () => {
      await setAuthToken('token-123');
      const headers = await dehubAuthHeaders();
      expect(headers['x-dehub-token']).toBe('token-123');
      expect(headers['x-wallet-address']).toBeUndefined();
    });

    it('is empty when signed out', async () => {
      const headers = await dehubAuthHeaders('0xabc');
      expect(headers).toEqual({});
    });
  });

  /**
   * A support question is never a generation.
   *
   * On 2026-09-03 a user asked the assistant four times why their unstaked
   * DHB had not arrived. Every message contained "withdrawal", the lists were
   * matched with `includes()`, and "withdrawal" contains "draw" — so all four
   * opened the image paywall, and the fourth was paid. 24 DHB for a picture
   * nobody asked for, and the question was never answered.
   */
  describe('support questions', () => {
    it.each([
      'Why my staked token not received',
      'Already withdrawal',
      'I already withdrawal my token from staking but still not received',
      'My staked token withdrawal already but recieved yet',
      'show me my balance',
      'i want my withdrawal',
      'what does this transaction fee mean',
      'the app is not working, i cannot log in',
    ])('never charges for %p', (text) => {
      expect(isSupportQuestion(text)).toBe(true);
      expect(isImageRequest(text)).toBe(false);
      expect(isVideoRequest(text)).toBe(false);
      expect(detectAiToolRequest(text, false)).toBeNull();
    });

    it('matches phrases as whole words, not fragments of other words', () => {
      expect(isImageRequest('how do I withdraw')).toBe(false);
      expect(isImageRequest('the input box sits under the header')).toBe(false);
      expect(isVideoRequest('when is the promotion running')).toBe(false);
    });

    it('lets explicit phrasing through anyway', () => {
      expect(isImageRequest('draw me a picture of a wallet')).toBe(true);
      expect(detectAiToolRequest('transcribe this support call', false)).toBe('speech-to-text');
    });
  });
});
