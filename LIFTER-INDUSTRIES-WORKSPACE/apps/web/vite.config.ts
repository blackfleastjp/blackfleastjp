import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootDirectory = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, rootDirectory);
  const apiTarget = rootEnv["API_BASE_URL"] ?? process.env["API_BASE_URL"];
  return {
    envDir: rootDirectory,
    plugins: [react()],
    ...(apiTarget ? { server: { proxy: { "/api": apiTarget } } } : {}),
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/react-router")
            ) {
              return "framework";
            }
            if (normalizedId.includes("/node_modules/@tanstack/react-query/")) {
              return "query";
            }
            if (normalizedId.includes("/node_modules/lucide-react/")) {
              return "icons";
            }
            if (normalizedId.includes("/node_modules/zod/")) {
              return "validation";
            }
            if (
              normalizedId.includes("/node_modules/recharts/") ||
              normalizedId.includes("/node_modules/d3-")
            ) {
              return "charts";
            }
          },
        },
      },
    },
  };
});
