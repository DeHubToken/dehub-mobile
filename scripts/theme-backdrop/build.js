#!/usr/bin/env node
/**
 * Builds assets/theme-backdrop/index.html: dehubweb's canvas-theme backgrounds
 * (Cosmic, Hazy Nights, Swarms, Lava Lamp, Winter, War, Osaka, Jungle,
 * Island, Hacker, Horror) bundled
 * unchanged into one page that the app runs in a WebView behind its screens.
 *
 *   node scripts/theme-backdrop/build.js ../dehubweb
 *
 * The dehubweb checkout must have its dependencies installed — three, react
 * and esbuild all come from its node_modules, so the backdrop always runs the
 * same versions the website does. Rebuild after a background changes on web.
 *
 * Only what the backgrounds import from the app around them is replaced (see
 * ./stubs): the theme comes from the page hash, not the web's ThemeContext.
 * The easter-egg images the nebula hides are swapped for a pixel; they are
 * 3.5 MB and never shown in the backdrop.
 */
const fs = require("fs");
const path = require("path");

const web = path.resolve(process.argv[2] || "../dehubweb");
const here = __dirname;
const out = path.resolve(here, "../../assets/theme-backdrop/index.html");

if (!fs.existsSync(path.join(web, "src/components/app/WarBackground.tsx"))) {
  console.error(`Not a dehubweb checkout: ${web}`);
  process.exit(1);
}

const esbuild = require(path.join(web, "node_modules/esbuild"));

const STUBS = {
  "@/contexts/ThemeContext": "stubs/ThemeContext.ts",
  "@/contexts/AuthContext": "stubs/AuthContext.ts",
  "@/lib/api/santa-leaderboard": "stubs/santa.ts",
  "react-router-dom": "stubs/router.ts",
};

// Async build: esbuild only runs plugins through its async API.
(async () => {
const result = await esbuild.build({
  entryPoints: [path.join(here, "entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  nodePaths: [path.join(web, "node_modules")],
  loader: { ".png": "dataurl", ".jpg": "dataurl" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    // Osaka's rain loop comes from the site itself: ThemeBackdrop loads this
    // page with https://dehub.io/ as its base, so the video is same-origin.
    "import.meta.env.VITE_OSAKA_MEDIA_BASE": '"osaka"',
  },
  plugins: [
    {
      name: "dehubweb",
      setup(b) {
        b.onResolve({ filter: /^(@\/|react-router-dom$)/ }, (a) => {
          if (STUBS[a.path]) return { path: path.join(here, STUBS[a.path]) };
          if (a.path.startsWith("@/assets/easter-eggs/")) return { path: path.join(here, "stubs/pixel.png") };
          return null;
        });
        b.onResolve({ filter: /^@\// }, (a) =>
          b.resolve("./" + a.path.slice(2), { resolveDir: path.join(web, "src"), kind: a.kind }),
        );
      },
    },
  ],
});

const js = result.outputFiles[0].text;
if (js.includes("</script")) {
  console.error("Bundle contains a closing script tag; it cannot be inlined.");
  process.exit(1);
}

const template = fs.readFileSync(path.join(here, "page.html"), "utf8");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, template.replace("/*BUNDLE*/", () => js));
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
