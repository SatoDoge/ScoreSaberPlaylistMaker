import { crx, defineManifest } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifestJson from "./public/manifest.json";

export default defineConfig({
  publicDir: "public",
  plugins: [crx({ manifest: defineManifest(manifestJson) })],
  server: {
    port: 5173,
    strictPort: true,
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
