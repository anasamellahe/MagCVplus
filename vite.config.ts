import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
  react(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // increase warning threshold to 1MB and split vendors into smaller chunks
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // don't isolate react into its own chunk — keep it with other vendor code
          // (separating react can create circular-import init-order problems at runtime)
          // UI libs
          if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('cmdk')) return 'vendor_ui';
          // excel parsing (large) — keep separate to avoid inflating main vendor
          if (id.includes('exceljs')) return 'vendor_exceljs';
          // docx manipulation can be large
          if (id.includes('docx')) return 'vendor_docx';
          // supabase client
          if (id.includes('@supabase') || id.includes('cross-fetch')) return 'vendor_supabase';
          // fall back vendor chunk
          return 'vendor';
        }
      }
    }
  }
}));
