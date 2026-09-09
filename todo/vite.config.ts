import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));
const popupRoot = fileURLToPath(new URL("./src/popup/", import.meta.url));
const backgroundEntry = fileURLToPath(new URL("./src/background/service-worker.ts", import.meta.url));
const distRoot = fileURLToPath(new URL("./dist/", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: popupRoot,
  server: {
    fs: {
      allow: [projectRoot]
    }
  },
  build: {
    emptyOutDir: true,
    outDir: distRoot,
    rollupOptions: {
      input: {
        popup: "popup.html",
        background: backgroundEntry
      },
      output: {
        entryFileNames: (chunkInfo) => chunkInfo.name === "background"
          ? "background/service-worker.js"
          : "assets/[name]-[hash].js"
      }
    }
  }
});
