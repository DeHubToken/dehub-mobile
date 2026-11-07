jest.unmock('../../libs/ai-consent');

import { Alert } from 'react-native';
import { ensureAiConsent, hasAiConsent, setAiConsent } from '../../libs/ai-consent';
import { storage } from '../../libs/storage';

type AlertButton = { text?: string; onPress?: () => void };

describe('libs/ai-consent (App Store build)', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    storage.clearAll();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  it('starts without permission', () => {
    expect(hasAiConsent()).toBe(false);
  });

  it('asks once and remembers a yes', async () => {
    const answer = ensureAiConsent();
    const again = ensureAiConsent();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons[buttons.length - 1].onPress?.();
    await expect(answer).resolves.toBe(true);
    await expect(again).resolves.toBe(true);
    expect(hasAiConsent()).toBe(true);
    await expect(ensureAiConsent()).resolves.toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('sends nothing after a no, and asks again next time', async () => {
    const answer = ensureAiConsent();
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons[1].onPress?.();
    await expect(answer).resolves.toBe(false);
    expect(hasAiConsent()).toBe(false);
    void ensureAiConsent();
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it('can be withdrawn from Settings', () => {
    setAiConsent(true);
    setAiConsent(false);
    expect(hasAiConsent()).toBe(false);
  });
});
