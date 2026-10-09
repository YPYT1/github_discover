import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: path("./"),
  resolve: {
    alias: {
      "@": path("../src"),
      "next/navigation": path("./src/navigation.ts"),
      "next/image": path("./src/image.tsx"),
      "next/link": path("./src/link.tsx"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 4173 },
});
