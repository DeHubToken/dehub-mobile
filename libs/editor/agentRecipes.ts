/** Ready-made multi-step requests for the editor assistant. */
export const AGENT_RECIPES = ["podcastClip", "talkingHead", "productPromo", "hypeReel", "retroEdit", "tutorial"] as const;
export type AgentRecipe = typeof AGENT_RECIPES[number];
