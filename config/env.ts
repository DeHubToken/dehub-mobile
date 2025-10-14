import {
  REOWN_PROJECT_ID,
  API_URL,
  APP_ENV,
  INFURA_KEY,
  WEB3AUTH_CLIENT_ID,
  CDN_BASE_URL,
  APP_ORIGIN,
  WEBSOCKET_URL,
  LIVEPEER_API_KEY,
  DEBUG,
  AUTH_PROVIDER,
} from "@env";
import { createLogger } from "../libs/logger";

const env = {
  REOWN_PROJECT_ID: REOWN_PROJECT_ID,
  API_URL: API_URL,
  APP_ENV: APP_ENV || "development",
  INFURA_KEY: INFURA_KEY,
  WEB3AUTH_CLIENT_ID: WEB3AUTH_CLIENT_ID,
  CDN_BASE_URL: CDN_BASE_URL,
  APP_ORIGIN: APP_ORIGIN || "https://dehub.io",
  WEBSOCKET_URL:
    WEBSOCKET_URL || API_URL?.replace(/\/$/, "") || "https://api.dehub.io",
  LIVEPEER_API_KEY: LIVEPEER_API_KEY,
  DEBUG: DEBUG,
  AUTH_PROVIDER: AUTH_PROVIDER,
};

// const log = createLogger('env');
// log.debug('REOWN_PROJECT_ID:', REOWN_PROJECT_ID);
export default env;
