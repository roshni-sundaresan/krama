import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC is needed so Nest decorators + emitDecoratorMetadata work under vitest.
export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
