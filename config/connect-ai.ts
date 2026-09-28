/**
 * Connect AI — the MCP endpoint and the two assistants the /connect pages
 * walk through. Mirrors dehubweb's ConnectPage, ConnectChatGPTPage and
 * ConnectClaudePage constants; keep the URLs in step with those.
 */
import env from "./env";

// dehub-mcp is the full server. The older /functions/v1/mcp endpoint is a
// read-only mirror of four of its tools and is not handed out any more.
export const MCP_URL = `${(env.SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/dehub-mcp`;

export type AiAppId = "chatgpt" | "claude";

export interface AiApp {
  id: AiAppId;
  /** Product name — never translated. */
  name: string;
  /** Opens the published DeHub connector inside the assistant. */
  appUrl: string;
  /** Where a custom connector is added by hand. */
  settingsUrl: string;
}

export const AI_APPS: Record<AiAppId, AiApp> = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    appUrl:
      "https://chatgpt.com/apps#settings/Connectors?connector=asdk_app_6a4962fb2cdc8191afcda7ca74b6082c",
    settingsUrl: "https://chatgpt.com/#settings/Connectors/Advanced",
  },
  claude: {
    id: "claude",
    name: "Claude",
    appUrl:
      "https://claude.ai/new#settings/customize-connectors/10c6ee66-064b-4d66-b544-139cdc732b0f",
    settingsUrl: "https://claude.ai/customize/connectors?modal=add-custom-connector",
  },
};
