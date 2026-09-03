import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les tests partagent un seul serveur sur un port fixe : pas de parallele.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
