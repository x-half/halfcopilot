import type { Tool } from "../types.js";
import { createFileReadTool } from "./file-read.js";
import { createFileWriteTool } from "./file-write.js";
import { createFileEditTool } from "./file-edit.js";
import { createBashTool } from "./bash.js";
import { createGrepTool } from "./grep.js";
import { createGlobTool } from "./glob.js";

export function createBuiltinTools(): Tool[] {
  return [
    createFileReadTool(),
    createFileWriteTool(),
    createFileEditTool(),
    createBashTool(),
    createGrepTool(),
    createGlobTool(),
  ];
}

export {
  createFileReadTool,
  createFileWriteTool,
  createFileEditTool,
  createBashTool,
  createGrepTool,
  createGlobTool,
};
