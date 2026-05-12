import type { Tool } from "../types.js";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createFileReadTool } from "./file-read.js";
import { createFileWriteTool } from "./file-write.js";
import { createFileEditTool } from "./file-edit.js";
import { createBashTool } from "./bash.js";
import { createGrepTool } from "./grep.js";
import { createGlobTool } from "./glob.js";
import { createWebSearchTool } from "./web-search.js";
import { createWeatherTool } from "./weather.js";
import { createUrlFetchTool } from "./url-fetch.js";

export function createBuiltinTools(): Tool[] {
  return [
    createFileReadTool(),
    createFileWriteTool(),
    createFileEditTool(),
    createBashTool(),
    createGrepTool(),
    createGlobTool(),
    createWebSearchTool(),
    createWeatherTool(),
    createUrlFetchTool(),
  ];
}

export function toLangChainTools(): DynamicStructuredTool[] {
  return createBuiltinTools().map((t) => t.toLangChain());
}

export {
  createFileReadTool,
  createFileWriteTool,
  createFileEditTool,
  createBashTool,
  createGrepTool,
  createGlobTool,
  createWebSearchTool,
  createWeatherTool,
  createUrlFetchTool,
};
