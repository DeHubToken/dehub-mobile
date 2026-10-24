export type TextCase = "upper" | "lower" | "title";
export type TextSelection = { start: number; end: number };

export function changeTextCase(value: string, mode: TextCase): string {
  if (mode === "upper") return value.toLocaleUpperCase();
  if (mode === "lower") return value.toLocaleLowerCase();
  return value.replace(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu, word => {
    const letters = Array.from(word.toLocaleLowerCase());
    return (letters.shift()?.toLocaleUpperCase() ?? "") + letters.join("");
  });
}

/** Empty selections address the entire field; offsets follow TextInput/textarea UTF-16 indices. */
export function changeSelectedTextCase(value: string, selection: TextSelection, mode: TextCase) {
  const from = Math.max(0, Math.min(value.length, Math.min(selection.start, selection.end)));
  const to = Math.max(from, Math.min(value.length, Math.max(selection.start, selection.end)));
  const start = from === to ? 0 : from, end = from === to ? value.length : to;
  const replacement = changeTextCase(value.slice(start, end), mode);
  return { value: value.slice(0, start) + replacement + value.slice(end), selection: { start, end: start + replacement.length } };
}
