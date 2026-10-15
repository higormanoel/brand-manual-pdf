import { defineConfig } from "vite";
export default defineConfig({
  build: {
    ssr: true,
    target: "node22",
    outDir: "dist/node",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/cli/cli.ts",
      external: ["playwright", "pdf-lib", "jszip", "zod"],
      output: { entryFileNames: "cli.js", inlineDynamicImports: true },
    },
  },
});
