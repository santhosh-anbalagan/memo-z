import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
const file = path => new URL(path, root);
const [html, css, worker, bundle] = await Promise.all([
  readFile(file("index.html"), "utf8"),
  readFile(file("styles.css"), "utf8"),
  readFile(file("sw.js"), "utf8"),
  build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: ["src/main.tsx"],
    platform: "browser",
    format: "esm",
    target: "es2022",
    bundle: true,
    minify: true,
    legalComments: "eof",
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
  }),
]);

const javascript = bundle.outputFiles[0].contents;
const version = createHash("sha256").update(javascript).update(css).update(html).update(worker).digest("hex").slice(0, 16);
const script = `app-${version}.js`;
const styles = `styles-${version}.css`;
const expand = value => value.replaceAll("@@VERSION@@", version).replaceAll("@@SCRIPT@@", script).replaceAll("@@STYLES@@", styles);

await mkdir(file("dist/assets/"), { recursive: true });
await Promise.all([
  writeFile(file(`dist/assets/${script}`), javascript),
  writeFile(file(`dist/assets/${styles}`), css),
]);
await writeFile(file("dist/sw.js"), expand(worker));
await writeFile(file("dist/index.html"), expand(html));
console.log(`Memo Z web bundle: ${(javascript.byteLength / 1024).toFixed(0)} KiB JavaScript before compression`);
