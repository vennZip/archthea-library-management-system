import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "backend",
          environment: "node",
          include: ["backend/tests/**/*.test.js"],
          testTimeout: 30000,
          hookTimeout: 60000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["frontend/src/**/*.test.{js,jsx}"],
          setupFiles: ["frontend/tests/setup.js"],
        },
      },
    ],
  },
});
