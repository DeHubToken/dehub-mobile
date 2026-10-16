export type TextDirection = "auto" | "ltr" | "rtl";
export function resolvedTextDirection(text: string, direction?: TextDirection): "ltr" | "rtl" {
  if (direction === "ltr" || direction === "rtl") return direction;
  for (const character of text) {
    if (!/\p{L}/u.test(character)) continue;
    const point = character.codePointAt(0)!;
    return point >= 0x0590 && point <= 0x08ff || point >= 0xfb1d && point <= 0xfdff || point >= 0xfe70 && point <= 0xfeff || point >= 0x10800 && point <= 0x10fff || point >= 0x1e800 && point <= 0x1e95f ? "rtl" : "ltr";
  }
  return "ltr";
}
