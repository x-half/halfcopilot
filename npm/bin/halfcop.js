#!/usr/bin/env node

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mainPath = join(
  __dirname,
  "..",
  "dist",
  "packages",
  "cli",
  "dist",
  "halfcop.js",
);
const mainModule = pathToFileURL(mainPath).href;

try {
  await import(mainModule);
} catch (err) {
  console.error("Failed to start HalfCopilot:", err.message);
  process.exit(1);
}
