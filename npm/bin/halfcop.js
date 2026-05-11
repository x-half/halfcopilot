#!/usr/bin/env node

import { join } from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

const mainPath = join(
  __dirname,
  "..",
  "dist",
  "packages",
  "cli",
  "dist",
  "halfcop.js",
);

try {
  await import(pathToFileURL(mainPath).href);
} catch (err) {
  console.error("Failed to start HalfCopilot:", err.message);
  process.exit(1);
}
