import { mkdirSync, rmdirSync } from "node:fs";
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { MemoryType, MemorySummary } from "./types.js";

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
    const [userMemory, feedbackMemory, projectMemory, references] =
      await Promise.all([
        this.readMemoryFile(this.getUserMemoryPath(), "user.md"),
        this.readMemoryFile(this.getUserMemoryPath(), "feedback.md"),
        this.readMemoryFile(this.getProjectMemoryPath(), "project.md"),
        this.readReferences(),
      ]);

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

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
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

      await mkdir(dirname(filePath), { recursive: true });

      const existing = await this.tryReadFile(filePath);
      const newContent = existing ? `${existing}\n\n${entry}` : entry;
      await writeFile(filePath, newContent, "utf-8");

      await this.archiveIfNeeded(filePath);
    } finally {
      this.releaseLock(type);
    }
  }

  private async archiveIfNeeded(filePath: string): Promise<void> {
    try {
      const stats = await stat(filePath);
      if (stats.size <= 100 * 1024) return;

      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const halfIndex = Math.floor(lines.length / 2);
      const archiveLines = lines.slice(0, halfIndex);
      const remainingLines = lines.slice(halfIndex);

      const archiveDir = join(dirname(filePath), "archive");
      await mkdir(archiveDir, { recursive: true });

      const archiveFile = join(archiveDir, `${Date.now()}.md`);
      await writeFile(archiveFile, archiveLines.join("\n"), "utf-8");
      await writeFile(filePath, remainingLines.join("\n"), "utf-8");
    } catch {
      // Ignore if file doesn't exist yet
    }
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

      const content = await this.tryReadFile(filePath);
      if (!content) continue;

      const lines = content.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({ type, content, matchedLine: line });
        }
      }
    }

    const refDir = join(this.getProjectMemoryPath(), "references");
    try {
      const files = (await readdir(refDir)).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = await readFile(join(refDir, file), "utf-8");
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
      // Ignore if ref directory doesn't exist
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

  private async readMemoryFile(
    basePath: string,
    fileName: string,
  ): Promise<string> {
    const filePath = join(basePath, fileName);
    return (await this.tryReadFile(filePath)) ?? "";
  }

  private async readReferences(): Promise<string[]> {
    const refDir = join(this.getProjectMemoryPath(), "references");
    try {
      const files = (await readdir(refDir)).filter((f) => f.endsWith(".md"));
      return Promise.all(
        files.map(async (f) => {
          const content = await readFile(join(refDir, f), "utf-8");
          return `### ${f}\n${content}`;
        }),
      );
    } catch {
      return [];
    }
  }

  private async tryReadFile(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }
}
