// Solid silhouette per tier — the artwork's alpha with every enclosed gap
// filled and the edge grown four percent, the same masks web builds with
// scripts/build-badge-plates.mjs. The badge showcase cuts its sticker from
// these, so gaps inside the outline read as sticker paper rather than holes.
export const BADGE_PLATES: Record<string, number> = {
  "Crab": require("../assets/badges/plates/Crab.png"),
  "Ghost Lobster": require("../assets/badges/plates/Ghost Lobster.png"),
  "Piranha": require("../assets/badges/plates/Piranha.png"),
  "Giant Tortoise": require("../assets/badges/plates/Giant Tortoise.png"),
  "King Cobra": require("../assets/badges/plates/King Cobra.png"),
  "Octopus": require("../assets/badges/plates/Octopus.png"),
  "Crocodile": require("../assets/badges/plates/Crocodile.png"),
  "Dolphin": require("../assets/badges/plates/Dolphin.png"),
  "Tiger Shark": require("../assets/badges/plates/Tiger Shark.png"),
  "Great White Shark": require("../assets/badges/plates/Great White Shark.png"),
  "Killer Whale": require("../assets/badges/plates/Killer Whale.png"),
  "Blue Whale": require("../assets/badges/plates/Blue Whale.png"),
  "Megalodon": require("../assets/badges/plates/Megalodon.png"),
};
