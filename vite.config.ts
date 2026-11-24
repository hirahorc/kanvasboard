import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// the board's viewer: built once into dist/viewer, which `kanvas view` serves
// beside the frames and `kanvas build` copies next to them
export default defineConfig({
  root: "viewer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist/viewer", emptyOutDir: true, assetsDir: "viewer" },
});
