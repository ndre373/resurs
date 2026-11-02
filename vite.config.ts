import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import gameBuildOutput from "./scripts/build-output"

// https://vite.dev/config/
export default defineConfig({
  // PAGES_BUILD=1 is set only by the GitHub Pages workflow — the app is
  // served under the /resurs/ subpath there; local builds keep the root "/"
  base: process.env.PAGES_BUILD ? "/resurs/" : "/",
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react(), gameBuildOutput()],
  build: {
    outDir: "dist/public", // the Hono server serves the client from here
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // three.js is big and changes rarely — its own long-cached chunk
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
})
