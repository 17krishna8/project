import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dashboard is served by the mock server itself at /__ui, so every built
// asset URL must be rooted there (see core's static handler).
export default defineConfig({
  plugins: [react()],
  base: "/__ui/",
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
