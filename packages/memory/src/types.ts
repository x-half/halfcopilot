export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryEntry {
  type: MemoryType;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySummary {
  userContext: string;
  feedbackContext: string;
  projectContext: string;
  references: string[];
}
