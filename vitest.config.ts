import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/data/**", "src/utils/**", "src/lib/**"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/skill-content.ts"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
