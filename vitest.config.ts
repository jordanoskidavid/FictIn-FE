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
        // Baseline measured 2026-09-27 (after covering all pages):
        // 96.8 stmts / 87.8 branches / 95.5 funcs / 98.2 lines. Thresholds sit ~5 points below.
        // Raise these as coverage grows — never lower them to make CI pass.
        thresholds: {
          statements: 92,
          branches: 83,
          functions: 90,
          lines: 93,
        },
      },
    },
  }),
);
