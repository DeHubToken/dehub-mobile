#!/usr/bin/env node
/**
 * Builds assets/badge-sticker/index.html: dehubweb's die-cut sticker renderer
 * (src/components/app/badge-showcase/sticker-stage.ts) bundled unchanged into
 * one page that the badge showcase runs in a WebView over its stage.
 *
 *   node scripts/badge-sticker/build.js ../dehubweb
 *
 * The dehubweb checkout must have its dependencies installed: three and
 * esbuild come from its node_modules, so the sticker runs the same versions
 * the website does. Rebuild after sticker-stage.ts changes on web; the art
 * comes from the app at runtime, so a renamed or redrawn badge needs nothing
 * here.
 */
const fs = require("fs");
const path = require("path");

const web = path.resolve(process.argv[2] || "../dehubweb");
const here = __dirname;
const out = path.resolve(here, "../../assets/badge-sticker/index.html");

if (!fs.existsSync(path.join(web, "src/components/app/badge-showcase/sticker-stage.ts"))) {
  console.error(`Not a dehubweb checkout: ${web}`);
  process.exit(1);
}

const esbuild = require(path.join(web, "node_modules/esbuild"));

async function main() {
  // Plugins need the async API; buildSync refuses them.
  const result = await esbuild.build({
    entryPoints: [path.join(here, "entry.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    write: false,
    nodePaths: [path.join(web, "node_modules")],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "dehubweb",
        setup(b) {
          b.onResolve({ filter: /^@\// }, (a) =>
            b.resolve("./" + a.path.slice(2), { resolveDir: path.join(web, "src"), kind: a.kind }),
          );
        },
      },
    ],
  });

  const js = result.outputFiles[0].text;
  if (js.includes("</script")) {
    throw new Error("Bundle contains a closing script tag; it cannot be inlined.");
  }

  const template = fs.readFileSync(path.join(here, "page.html"), "utf8");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, template.replace("/*BUNDLE*/", () => js));
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
