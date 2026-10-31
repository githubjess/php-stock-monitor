import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "/",
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL("./index.html", import.meta.url)),
        contact: fileURLToPath(new URL("./contact/index.html", import.meta.url)),
        navigation: fileURLToPath(new URL("./i18n/navigation.js", import.meta.url)),
        impressum: fileURLToPath(new URL("./impressum/index.html", import.meta.url)),
        shareMonitor: fileURLToPath(new URL("./share-monitor/index.html", import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "navigation"
          ? "jm-authenticator/navigation.js" : "assets/[name]-[hash].js",
      },
    },
  },
  plugins: [
    react(),
    {
      name: "jm-authenticator-privacy-local-preview",
      apply: "serve",
      configureServer(server) {
        // Vite's public-file middleware does not resolve directory index pages.
        server.middlewares.use((req, _res, next) => {
          if (req.url?.split("?")[0] === "/jm-authenticator/navigation.js") {
            req.url = req.url.replace("/jm-authenticator/navigation.js", "/i18n/navigation.js");
          }
          if (req.url?.split("?")[0] === "/jm-authenticator/privacy/") {
            req.url = req.url.replace(
              "/jm-authenticator/privacy/",
              "/jm-authenticator/privacy/index.html",
            );
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/contact/send.php": "http://localhost:8080",
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080"
    }
  }
});
