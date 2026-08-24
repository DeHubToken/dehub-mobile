/**
 * Flips to true the moment the boot preloader starts to lift (App.tsx →
 * beginReveal).
 *
 * Surfaces that mount underneath the preloader read this to suppress their
 * one-shot entrance choreography: played while covered, it finishes unseen
 * and the user catches only its tail end as movement right on top of the
 * reveal — exactly what the covered mount exists to prevent. Remounts later
 * in the session (auth stack replace, sign-out/in) happen after the flag is
 * set and keep their entrance.
 */
export let bootRevealed = false;

export function markBootRevealed(): void {
  bootRevealed = true;
}
