import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Inline the pdf.worker.js as a base64 string so we can create a blob URL at runtime
const workerInlinePlugin = {
  name: "pdf-worker-inline",
  setup(build) {
    build.onResolve({ filter: /^pdf-worker-inline$/ }, args => ({
      path: args.path,
      namespace: "pdf-worker-inline",
    }));
    build.onLoad({ filter: /^pdf-worker-inline$/, namespace: "pdf-worker-inline" }, () => {
      const workerPath = path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.js");
      const workerSrc = fs.readFileSync(workerPath, "utf8");
      const b64 = Buffer.from(workerSrc).toString("base64");
      return {
        contents: `module.exports = "${b64}";`,
        loader: "js",
      };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  plugins: [workerInlinePlugin],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
