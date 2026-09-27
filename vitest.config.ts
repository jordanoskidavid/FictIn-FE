import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/test/**",
          "src/main.tsx",
          "src/**/*.d.ts",
          "src/lib/types.ts",
        ],
        reporter: ["text", "html", "lcov"],
        // Baseline measured 2026-09-27: 60.4 stmts / 53.9 branches / 63.3 funcs / 60.7 lines.
        // Raise these as coverage grows — never lower them to make CI pass.
        thresholds: {
          statements: 55,
          branches: 50,
          functions: 55,
          lines: 55,
        },
      },
    },
  }),
);
