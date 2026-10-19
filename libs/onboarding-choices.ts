/**
 * What a new user picked on the first-run setup before they had an account.
 *
 * The audience step (Kids / Everyone / Mature 18+) runs before sign-in, but
 * both settings it drives live on the account: Kids Mode is a server flag with
 * a PIN, mature content is `showMatureContent` on the profile. So the choice is
 * kept here and handed to the account the first time one is signed in
 * (components/Onboarding/OnboardingChoicesApplier).
 *
 * Kids Mode does not wait for that: picking it arms the device lock straight
 * away (libs/kids-mode-lock), so a guest who taps "Explore without signing in"
 * is already filtered. The PIN they set is kept in SecureStore so the same PIN
 * can turn the account flag on later, and so a guest can still leave Kids Mode
 * with it before any account exists.
 *
 * @module libs/onboarding-choices
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type OnboardingAudience = 'kids' | 'everyone' | 'mature';

const PIN_KEY = 'dhb_pending_kids_pin';
const MATURE_KEY = '@dhb_pending_mature';
const STEP_KEY = '@dhb_onboarding_step';

/** Synchronous mirrors, so useKidsMode can tell in its effect whether to hold off. */
let pendingPin: string | null = null;
let pendingMature = false;

async function hydrate(): Promise<void> {
  try {
    const [pin, mature] = await Promise.all([
      SecureStore.getItemAsync(PIN_KEY),
      AsyncStorage.getItem(MATURE_KEY),
    ]);
    pendingPin = pin || null;
    pendingMature = mature === '1';
  } catch {
    // Nothing pending is the safe reading: the account settings stay as they are.
  }
}

/** Settles once the stored choices are in the mirrors above. */
export const onboardingChoicesReady: Promise<void> = hydrate();

export function hasPendingKidsPin(): boolean {
  return pendingPin !== null;
}

export function getPendingKidsPin(): string | null {
  return pendingPin;
}

export function hasPendingMature(): boolean {
  return pendingMature;
}

export async function setPendingKidsPin(pin: string): Promise<void> {
  pendingPin = pin;
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function clearPendingKidsPin(): Promise<void> {
  pendingPin = null;
  await SecureStore.deleteItemAsync(PIN_KEY).catch(() => {});
}

export async function setPendingMature(on: boolean): Promise<void> {
  pendingMature = on;
  if (on) await AsyncStorage.setItem(MATURE_KEY, '1');
  else await AsyncStorage.removeItem(MATURE_KEY);
}

/**
 * The setup step to resume on. Choosing a right-to-left language restarts the
 * app (React Native reads the layout direction only at launch), and the setup
 * has to come back on the step after the language, not start over.
 */
export async function getSavedSetupStep(): Promise<number> {
  try {
    const value = Number(await AsyncStorage.getItem(STEP_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function saveSetupStep(step: number | null): Promise<void> {
  try {
    if (step === null) await AsyncStorage.removeItem(STEP_KEY);
    else await AsyncStorage.setItem(STEP_KEY, String(step));
  } catch {
    // Worst case the setup starts again from the language step.
  }
}
