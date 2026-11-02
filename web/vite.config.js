import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { deploymentFiles } from "./deployment-files.js";

function removeFinderMetadata(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) removeFinderMetadata(path);
    else if (entry.name === ".DS_Store") unlinkSync(path);
  }
}

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
      name: "jegprofil-release-package",
      apply: "build",
      generateBundle() {
        for (const file of deploymentFiles) {
          this.emitFile({
            type: "asset",
            fileName: file.destination,
            source: readFileSync(new URL(file.source, import.meta.url)),
          });
        }
      },
      writeBundle(output) {
        if (output.dir) removeFinderMetadata(output.dir);
      },
    },
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
          if (req.url?.split("?")[0] === "/jm-authenticator/support/") {
            req.url = req.url.replace(
              "/jm-authenticator/support/",
              "/jm-authenticator/support/index.html",
            );
          }
          if (req.url?.split("?")[0] === "/privacy/") {
            req.url = req.url.replace("/privacy/", "/privacy/index.html");
          }
          if (req.url?.split("?")[0] === "/jm-authenticator/guide/") {
            req.url = req.url.replace(
              "/jm-authenticator/guide/",
              "/jm-authenticator/guide/index.html",
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
