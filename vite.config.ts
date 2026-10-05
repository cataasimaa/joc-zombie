import { defineConfig } from "vite";

export default defineConfig({
  // Căi relative: necesar pentru Capacitor (aplicația mobilă) și pentru găzduire în subfoldere.
  base: "./",
  server: { host: true },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
