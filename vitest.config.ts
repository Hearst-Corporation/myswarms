import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Node environment — we test route handlers and pure logic, no DOM needed
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
