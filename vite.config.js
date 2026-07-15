import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Trning — adaptive daily training",
        short_name: "Trning",
        description: "Adaptive daily training: readiness-aware workout generation with logging and progress tracking.",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0E1116",
        theme_color: "#0E1116",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      }
    })
  ]
});
