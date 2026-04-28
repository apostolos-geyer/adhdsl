import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      adhdsl: "/Users/stoli/Desktop/devel/personal/march-2025/ADHDSL/src/index.ts",
    },
  },
});
