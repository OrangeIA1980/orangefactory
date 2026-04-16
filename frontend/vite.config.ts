import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Durante desarrollo el frontend se sirve en :5173 y habla con el backend en :8000.
// En produccion nginx enruta /api hacia el backend, asi que la base de la API se toma de VITE_API_BASE.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
