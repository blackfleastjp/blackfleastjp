import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/api/src/**/*.test.ts", "packages/config/src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["apps/api/src/**/*.ts", "packages/config/src/**/*.ts"],
    },
  },
});
