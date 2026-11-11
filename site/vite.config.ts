import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { fillHtmlFacts, htmlFacts } from "./src/html-facts";

/**
 * Fills the {{placeholders}} in index.html (the title and the two descriptions) from the snapshot
 * that ships with the build, so the numbers in the page head always match the data. A snapshot that
 * is missing or is not JSON fails the build; the deploy workflow then leaves the previous site in place.
 */
function htmlFactsPlugin(): Plugin {
  let snapshotFile = "";
  return {
    name: "crossroads-html-facts",
    configResolved(config) {
      snapshotFile = path.join(config.publicDir, "data", "snapshot.json");
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let snapshot: unknown;
        try {
          snapshot = JSON.parse(readFileSync(snapshotFile, "utf-8"));
        } catch (error) {
          throw new Error(`crossroads-html-facts: cannot read ${snapshotFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return fillHtmlFacts(html, htmlFacts(snapshot && typeof snapshot === "object" ? snapshot : null));
      },
    },
  };
}

// Relative base so the build works on GitHub Pages project URLs and any static host.
export default defineConfig({
  base: "./",
  plugins: [react(), htmlFactsPlugin()],
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
});
