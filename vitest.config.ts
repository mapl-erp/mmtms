import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

for (const line of readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] == null) process.env[match[1]] = match[2];
}

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
