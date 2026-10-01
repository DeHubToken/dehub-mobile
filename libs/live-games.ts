/**
 * Games shown as box art on the phone Live page (CinematicLive), most watched first. Same
 * list, art and match names as web's `src/constants/live-games.ts`.
 * `match` lists the category names a stream may carry for that game.
 * Art is the official cover (logo included); Steam's portrait library art
 * where the game is on Steam, our own copies otherwise.
 */
import type { ImageSourcePropType } from "react-native";

export interface LiveGame {
  id: string;
  name: string;
  image: ImageSourcePropType;
  match: string[];
}

const steam = (appId: number): ImageSourcePropType => ({
  uri: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
});

export const LIVE_GAMES: LiveGame[] = [
  { id: "lcs", name: "Last Chad Standing", image: require("../assets/live-games/lcs-category.png"), match: ["last chad standing", "lcs"] },
  { id: "gta", name: "Grand Theft Auto V", image: require("../assets/live-games/gta-category.png"), match: ["grand theft auto", "gta"] },
  { id: "league", name: "League of Legends", image: require("../assets/live-games/league-category.png"), match: ["league of legends", "lol"] },
  { id: "valorant", name: "VALORANT", image: require("../assets/live-games/valorant-category.png"), match: ["valorant"] },
  { id: "cs2", name: "Counter-Strike 2", image: steam(730), match: ["counter-strike", "cs2", "csgo", "cs:go"] },
  { id: "fortnite", name: "Fortnite", image: require("../assets/live-games/fortnite-category.png"), match: ["fortnite"] },
  { id: "minecraft", name: "Minecraft", image: require("../assets/live-games/minecraft-category.png"), match: ["minecraft"] },
  { id: "apex", name: "Apex Legends", image: require("../assets/live-games/apex-category.png"), match: ["apex"] },
  { id: "cod", name: "Call of Duty", image: require("../assets/live-games/cod-category.png"), match: ["call of duty", "warzone", "cod"] },
  { id: "dota2", name: "Dota 2", image: steam(570), match: ["dota"] },
  { id: "marvel-rivals", name: "Marvel Rivals", image: steam(2767030), match: ["marvel rivals"] },
  { id: "rust", name: "Rust", image: steam(252490), match: ["rust"] },
  { id: "overwatch", name: "Overwatch 2", image: steam(2357570), match: ["overwatch"] },
  { id: "eafc", name: "EA SPORTS FC 25", image: steam(2669320), match: ["ea sports fc", "ea fc", "fifa"] },
  { id: "rocket-league", name: "Rocket League", image: steam(252950), match: ["rocket league"] },
  { id: "pubg", name: "PUBG: BATTLEGROUNDS", image: steam(578080), match: ["pubg", "battlegrounds"] },
  { id: "dbd", name: "Dead by Daylight", image: steam(381210), match: ["dead by daylight"] },
  { id: "r6", name: "Rainbow Six Siege", image: steam(359550), match: ["rainbow six", "r6"] },
  { id: "elden-ring", name: "ELDEN RING", image: steam(1245620), match: ["elden ring"] },
  { id: "bg3", name: "Baldur's Gate 3", image: steam(1086940), match: ["baldur's gate", "baldurs gate", "bg3"] },
  { id: "helldivers", name: "HELLDIVERS 2", image: steam(553850), match: ["helldivers"] },
];

export function streamMatchesGame(category: string | undefined, game: LiveGame): boolean {
  const c = (category || "").toLowerCase();
  return !!c && game.match.some((m) => c.includes(m));
}
