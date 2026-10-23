/**
 * Connect AI — the MCP endpoint and the two assistants the /connect pages
 * walk through. Mirrors dehubweb's ConnectPage, ConnectChatGPTPage and
 * ConnectClaudePage constants; keep the URLs in step with those.
 */
// OAuth connects the person's own account. Agent connectors keep their separate
// key-based endpoint in agents.service.ts.
export const MCP_URL = 'https://dehub.io/mcp';
export const ACCOUNT_CONNECTIONS_URL = 'https://dehub.io/connect/chatgpt?manage=1';

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
