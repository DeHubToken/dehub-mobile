import React from "react";
import { SignInPrompt } from "../auth/SignInGate";

/**
 * The signed-out profile screen. Web routes this through the very same
 * `AuthGate` as its twelve other gated pages, so mobile does too rather than
 * keeping the near-duplicate it had — a 24/700 heading, a hardcoded English
 * "Log in / Sign up" label and a solid near-white bar, none of which matched
 * the gate two taps away.
 *
 * `ProfileScreen` already paints the background and the header above this, so
 * the transparent, unpadded prompt is the right half to render.
 */
const ProfileSignInPrompt: React.FC = () => <SignInPrompt />;

export default ProfileSignInPrompt;
