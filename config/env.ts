const env = {
  REOWN_PROJECT_ID: process.env.REOWN_PROJECT_ID || "8fa2d8d54f8acc7aa5421c69ff94878e",
  API_URL: process.env.API_URL || "https://api.dehub.io/api",
  APP_ENV: process.env.APP_ENV || "development",
  INFURA_KEY: process.env.INFURA_KEY || "9aa3d95b3bc440fa88ea12eaa4456161",
  WEB3AUTH_CLIENT_ID: process.env.WEB3AUTH_CLIENT_ID || "BERcmK50vSCtHWg27czoN3eSiyR67U70mFITvAADvrBDX-DkgLBThKkd1Wkmyf3o45kRZxeyzqOyvnHM07xTdR8",
  CDN_BASE_URL: process.env.CDN_BASE_URL || "https://dehubcdn.ams3.cdn.digitaloceanspaces.com",
  APP_ORIGIN: process.env.APP_ORIGIN || "https://dehub.io",
};

console.log("REOWN_PROJECT_ID:", process.env.REOWN_PROJECT_ID);
export default env;