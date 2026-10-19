/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_BACKEND_URL || "http://localhost:4000";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": { target: backend, changeOrigin: true } } },
  preview: { port: 5173, proxy: { "/api": { target: backend, changeOrigin: true } } },
  test: { environment: "jsdom", globals: true, setupFiles: ["tests/setup.ts"] },
});
