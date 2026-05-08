export interface SkillDefinition {
  name: string;
  description: string;
  instructions: string;
  resources?: SkillResource[];
  triggers?: SkillTrigger[];
  metadata?: Record<string, unknown>;
}

export interface SkillResource {
  type: 'file' | 'url' | 'template';
  path: string;
  description?: string;
}

export interface SkillTrigger {
  type: 'keyword' | 'pattern' | 'intent';
  value: string;
}

export interface SkillContext {
  projectRoot: string;
  workingDirectory: string;
  sessionId: string;
  variables: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  artifacts?: Array<{
    path: string;
    content: string;
  }>;
}

export interface Skill extends SkillDefinition {
  execute(context: SkillContext, input: Record<string, unknown>): Promise<SkillResult>;
}
