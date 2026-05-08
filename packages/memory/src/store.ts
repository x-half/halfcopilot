import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { MemoryType, MemoryEntry, MemorySummary } from './types.js';

export class MemoryStore {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  getUserMemoryPath(): string {
    return join(homedir(), '.halfcopilot', 'memory');
  }

  getProjectMemoryPath(): string {
    return join(this.projectRoot, '.halfcopilot', 'memory');
  }

  async load(): Promise<MemorySummary> {
    const userMemory = this.readMemoryFile(this.getUserMemoryPath(), 'user.md');
    const feedbackMemory = this.readMemoryFile(this.getUserMemoryPath(), 'feedback.md');
    const projectMemory = this.readMemoryFile(this.getProjectMemoryPath(), 'project.md');
    const references = this.readReferences();

    return {
      userContext: userMemory,
      feedbackContext: feedbackMemory,
      projectContext: projectMemory,
      references,
    };
  }

  async save(type: MemoryType, content: string): Promise<void> {
    const basePath = type === 'user' || type === 'feedback'
      ? this.getUserMemoryPath()
      : this.getProjectMemoryPath();

    const fileName = `${type}.md`;
    const filePath = join(basePath, fileName);

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
  }

  async append(type: MemoryType, entry: string): Promise<void> {
    const basePath = type === 'user' || type === 'feedback'
      ? this.getUserMemoryPath()
      : this.getProjectMemoryPath();

    const fileName = `${type}.md`;
    const filePath = join(basePath, fileName);

    mkdirSync(dirname(filePath), { recursive: true });

    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    const newContent = existing ? `${existing}\n\n${entry}` : entry;
    writeFileSync(filePath, newContent, 'utf-8');
  }

  async clear(type: MemoryType): Promise<void> {
    await this.save(type, '');
  }

  generateSummary(summary: MemorySummary): string {
    return `# Context Memory

## User Context
${summary.userContext || 'No user context'}

## Feedback
${summary.feedbackContext || 'No feedback'}

## Project Context
${summary.projectContext || 'No project context'}

## References
${summary.references.length > 0 ? summary.references.join('\n') : 'No references'}
`.trim();
  }

  private readMemoryFile(basePath: string, fileName: string): string {
    const filePath = join(basePath, fileName);
    if (!existsSync(filePath)) return '';
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private readReferences(): string[] {
    const refDir = join(this.getProjectMemoryPath(), 'references');
    if (!existsSync(refDir)) return [];

    try {
      const files = readdirSync(refDir).filter(f => f.endsWith('.md'));
      return files.map(f => {
        const content = readFileSync(join(refDir, f), 'utf-8');
        return `### ${f}\n${content}`;
      });
    } catch {
      return [];
    }
  }
}
