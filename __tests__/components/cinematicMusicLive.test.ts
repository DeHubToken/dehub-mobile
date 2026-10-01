import { readFileSync } from "fs";
import { resolve } from "path";
import { LIVE_GAMES, streamMatchesGame } from "../../libs/live-games";

const read = (...parts: string[]) => readFileSync(resolve(__dirname, "..", "..", ...parts), "utf8");

describe("cinematic Music and Live tabs (System theme, phones)", () => {
  it("swaps the Music and Live pages only on System phones", () => {
    const home = read("screens", "HomeScreen.tsx");
    const hook = read("hooks", "useCinematicPhone.ts");

    expect(hook).toContain('theme === "system" && !skin && Math.min(width, height) <= CINEMATIC_PHONE_MAX_WIDTH');
    expect(hook).toContain("CINEMATIC_PHONE_MAX_WIDTH = 639");
    expect(home).toContain("if (cinematicPhone) {\n        return (\n          <CinematicMusic");
    expect(home).toContain('if (feedType === "live" && cinematicPhone) {');
  });

  it("keeps web's game list, art sources and matching", () => {
    expect(LIVE_GAMES.map((g) => g.id).slice(0, 5)).toEqual(["lcs", "gta", "league", "valorant", "cs2"]);
    expect(LIVE_GAMES).toHaveLength(21);
    expect(LIVE_GAMES.find((g) => g.id === "cs2")?.image).toEqual({
      uri: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/library_600x900_2x.jpg",
    });
    const cod = LIVE_GAMES.find((g) => g.id === "cod")!;
    expect(streamMatchesGame("Call of Duty: Warzone", cod)).toBe(true);
    expect(streamMatchesGame(undefined, cod)).toBe(false);
  });

  it("sorts the chart by views for Top 50 and by date for New", () => {
    const music = read("components", "Music", "CinematicMusic.tsx");
    expect(music).toContain('useMusicChart("views", chip === "top", address)');
    expect(music).toContain('useMusicChart("createdAt", chip === "new", address)');
    expect(music).toContain("const heroStation = (isPlaying && currentStation) || radioStations[0];");
  });
});
