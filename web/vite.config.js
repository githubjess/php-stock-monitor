import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "jm-authenticator-privacy-local-preview",
      apply: "serve",
      configureServer(server) {
        // Vite's public-file middleware does not resolve directory index pages.
        server.middlewares.use((req, _res, next) => {
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
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080"
    }
  }
});
