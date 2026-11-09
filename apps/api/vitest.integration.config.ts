import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.itest.ts"], fileParallelism: false, testTimeout: 60_000, hookTimeout: 120_000, pool: "forks" } });
