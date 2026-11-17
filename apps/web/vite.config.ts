import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  server: { port: 5173, proxy: { "/v1": "http://127.0.0.1:8787", "/health": "http://127.0.0.1:8787" } },
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
});
