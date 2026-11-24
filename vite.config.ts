import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Makes the site installable ("Add to Home Screen") and keeps the app itself on the phone,
    // so it opens with no signal. Data and photos are handled by src/lib/offlineQueue.ts.
    VitePWA({
      registerType: "autoUpdate", // picks up a new deploy by itself the next time the phone is online
      includeAssets: ["apple-touch-icon.png", "lumico-logo-clear.png", "lumico-logo.svg", "favicon.svg"],
      manifest: {
        name: "Lumico Staff Portal",
        short_name: "Lumico",
        description: "Lumico Electricals staff portal: inspections, timesheets and work history.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b0d14",
        theme_color: "#0b0d14",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff,woff2}"],
        navigateFallback: "/index.html", // any page address opens the app, even offline
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // The Barlow font is loaded from Google; keep it after the first online visit
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "/src/styles/_variables.scss" as *;`,
      },
    },
  },
});
