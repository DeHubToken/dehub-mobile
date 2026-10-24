/** Shuffle a copy so every visit gets a fresh mix without changing the catalogue. */
export function loginClipLanes<T>(clips: readonly T[], random: () => number = Math.random) {
  const shuffled = [...clips];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 8);
  const midpoint = Math.ceil(selected.length / 2);
  return { first: selected.slice(0, midpoint), second: selected.slice(midpoint) };
}

