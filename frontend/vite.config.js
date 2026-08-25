import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifestFilename: "app.webmanifest",
      manifest: {
        id: "/",
        name: "映墨 · Ying-Mo",
        short_name: "映墨",
        description: "写字，也和朋友一起记录生活。",
        lang: "zh-CN",
        start_url: "/home?source=pwa",
        scope: "/",
        display: "standalone",
        background_color: "#f5f4ed",
        theme_color: "#f5f4ed",
        categories: ["lifestyle", "social", "productivity"],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          {
            name: "写随记",
            short_name: "写随记",
            description: "创建一条新的生活随记",
            url: "/home?compose=note&source=pwa-shortcut",
            icons: [{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "写文章",
            short_name: "写文章",
            description: "创建一篇新的文章",
            url: "/write?type=article&source=pwa-shortcut",
            icons: [{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "搜索映墨",
            short_name: "搜索",
            description: "搜索有权访问的记录",
            url: "/search?source=pwa-shortcut",
            icons: [{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_PROXY || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    manifest: true,
    sourcemap: true,
  },
});
