import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { MemoryType, MemoryEntry, MemorySummary } from "./types.js";

export class MemoryStore {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  getUserMemoryPath(): string {
    return join(homedir(), ".halfcopilot", "memory");
  }

  getProjectMemoryPath(): string {
    return join(this.projectRoot, ".halfcopilot", "memory");
  }

  async load(): Promise<MemorySummary> {
    const userMemory = this.readMemoryFile(this.getUserMemoryPath(), "user.md");
    const feedbackMemory = this.readMemoryFile(
      this.getUserMemoryPath(),
      "feedback.md",
    );
    const projectMemory = this.readMemoryFile(
      this.getProjectMemoryPath(),
      "project.md",
    );
    const references = this.readReferences();

    return {
      userContext: userMemory,
      feedbackContext: feedbackMemory,
      projectContext: projectMemory,
      references,
    };
  }

  async save(type: MemoryType, content: string): Promise<void> {
    await this.acquireLock(type);
    try {
      const basePath = this.getBasePath(type);
      const fileName = `${type}.md`;
      const filePath = join(basePath, fileName);

      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, "utf-8");
    } finally {
      this.releaseLock(type);
    }
  }

  async append(type: MemoryType, entry: string): Promise<void> {
    await this.acquireLock(type);
    try {
      const basePath = this.getBasePath(type);
      const fileName = `${type}.md`;
      const filePath = join(basePath, fileName);

      mkdirSync(dirname(filePath), { recursive: true });

      const existing = existsSync(filePath)
        ? readFileSync(filePath, "utf-8")
        : "";
      const newContent = existing ? `${existing}\n\n${entry}` : entry;
      writeFileSync(filePath, newContent, "utf-8");

      this.archiveIfNeeded(filePath);
    } finally {
      this.releaseLock(type);
    }
  }

  private archiveIfNeeded(filePath: string): void {
    if (!existsSync(filePath)) return;

    const stats = statSync(filePath);
    if (stats.size <= 100 * 1024) return;

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const halfIndex = Math.floor(lines.length / 2);
    const archiveLines = lines.slice(0, halfIndex);
    const remainingLines = lines.slice(halfIndex);

    const archiveDir = join(dirname(filePath), "archive");
    mkdirSync(archiveDir, { recursive: true });

    const archiveFile = join(archiveDir, `${Date.now()}.md`);
    writeFileSync(archiveFile, archiveLines.join("\n"), "utf-8");
    writeFileSync(filePath, remainingLines.join("\n"), "utf-8");
  }

  async clear(type: MemoryType): Promise<void> {
    await this.save(type, "");
  }

  async search(
    keyword: string,
  ): Promise<
    Array<{ type: MemoryType; content: string; matchedLine: string }>
  > {
    const results: Array<{
      type: MemoryType;
      content: string;
      matchedLine: string;
    }> = [];
    const types: MemoryType[] = ["user", "feedback", "project"];

    for (const type of types) {
      const basePath = this.getBasePath(type);
      const fileName = `${type}.md`;
      const filePath = join(basePath, fileName);

      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({ type, content, matchedLine: line });
        }
      }
    }

    const refDir = join(this.getProjectMemoryPath(), "references");
    if (existsSync(refDir)) {
      try {
        const files = readdirSync(refDir).filter((f) => f.endsWith(".md"));
        for (const file of files) {
          const content = readFileSync(join(refDir, file), "utf-8");
          const lines = content.split("\n");
          for (const line of lines) {
            if (line.toLowerCase().includes(keyword.toLowerCase())) {
              results.push({
                type: "reference" as MemoryType,
                content,
                matchedLine: line,
              });
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }

    return results;
  }

  generateSummary(summary: MemorySummary): string {
    return `# Context Memory

## User Context
${summary.userContext || "No user context"}

## Feedback
${summary.feedbackContext || "No feedback"}

## Project Context
${summary.projectContext || "No project context"}

## References
${summary.references.length > 0 ? summary.references.join("\n") : "No references"}
`.trim();
  }

  private getBasePath(type: MemoryType): string {
    return type === "user" || type === "feedback"
      ? this.getUserMemoryPath()
      : this.getProjectMemoryPath();
  }

  private async acquireLock(type: MemoryType): Promise<void> {
    const basePath = this.getBasePath(type);
    mkdirSync(basePath, { recursive: true });
    const lockPath = join(basePath, `.lock_${type}`);
    while (true) {
      try {
        mkdirSync(lockPath);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  private releaseLock(type: MemoryType): void {
    try {
      rmdirSync(join(this.getBasePath(type), `.lock_${type}`));
    } catch {
      // Ignore if lock doesn't exist
    }
  }

  private readMemoryFile(basePath: string, fileName: string): string {
    const filePath = join(basePath, fileName);
    if (!existsSync(filePath)) return "";
    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  private readReferences(): string[] {
    const refDir = join(this.getProjectMemoryPath(), "references");
    if (!existsSync(refDir)) return [];

    try {
      const files = readdirSync(refDir).filter((f) => f.endsWith(".md"));
      return files.map((f) => {
        const content = readFileSync(join(refDir, f), "utf-8");
        return `### ${f}\n${content}`;
      });
    } catch {
      return [];
    }
  }
}
