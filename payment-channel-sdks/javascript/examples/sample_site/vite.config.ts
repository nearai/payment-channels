import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import react from "@vitejs/plugin-react";
import { defineConfig, UserConfig } from "vite";

interface NodeGlobalsPolyfillOptions {
  buffer?: boolean;
  [key: string]: boolean | undefined;
}

const config: UserConfig = {
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        } as NodeGlobalsPolyfillOptions),
      ],
    },
  },
};

export default defineConfig(config);
