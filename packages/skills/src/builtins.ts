import type { Skill, SkillContext, SkillResult } from './types.js';

export function createGitCommitSkill(): Skill {
  return {
    name: 'git-commit',
    description: 'Create a git commit with a meaningful message',
    instructions: `When the user asks to commit changes or save work:
1. Run 'git status' to see what files have changed
2. Run 'git diff' to see the actual changes
3. Analyze the changes and write a meaningful commit message
4. Stage the relevant files with 'git add'
5. Create the commit with 'git commit -m "message"'

Follow conventional commit format: type(scope): description
Types: feat, fix, docs, style, refactor, test, chore`,
    triggers: [
      { type: 'keyword', value: 'commit' },
      { type: 'keyword', value: 'save changes' },
      { type: 'intent', value: 'save' },
    ],
    async execute(context: SkillContext, input: Record<string, unknown>): Promise<SkillResult> {
      return {
        success: true,
        output: 'Please use the bash tool to run git commands. I will help you create a meaningful commit message based on the changes.',
      };
    },
  };
}

export function createTestRunnerSkill(): Skill {
  return {
    name: 'test-runner',
    description: 'Run tests for the current project',
    instructions: `When the user asks to run tests:
1. Check for package.json to determine the test framework
2. Run the appropriate test command:
   - npm/pnpm/yarn: 'npm test' / 'pnpm test' / 'yarn test'
   - pytest: 'pytest'
   - go test: 'go test ./...'
3. Report the test results

If tests fail, help identify and fix the issues.`,
    triggers: [
      { type: 'keyword', value: 'test' },
      { type: 'keyword', value: 'run tests' },
      { type: 'intent', value: 'test' },
    ],
    async execute(context: SkillContext, input: Record<string, unknown>): Promise<SkillResult> {
      return {
        success: true,
        output: 'Please use the bash tool to run test commands. I will help you analyze and fix any test failures.',
      };
    },
  };
}

export function createCodeReviewSkill(): Skill {
  return {
    name: 'code-review',
    description: 'Review code for potential issues',
    instructions: `When reviewing code:
1. Read the file(s) to review
2. Check for:
   - Syntax errors
   - Logic errors
   - Security vulnerabilities
   - Performance issues
   - Code style inconsistencies
   - Missing error handling
   - Unclear variable/function names
3. Provide specific, actionable feedback
4. Suggest improvements with code examples`,
    triggers: [
      { type: 'keyword', value: 'review' },
      { type: 'keyword', value: 'check code' },
      { type: 'keyword', value: 'code review' },
    ],
    async execute(context: SkillContext, input: Record<string, unknown>): Promise<SkillResult> {
      return {
        success: true,
        output: 'Please specify which files you would like me to review. I will analyze them for potential issues and suggest improvements.',
      };
    },
  };
}

export function createDocumentationSkill(): Skill {
  return {
    name: 'documentation',
    description: 'Generate or update documentation',
    instructions: `When generating documentation:
1. Read the source code
2. Identify:
   - Public APIs and their signatures
   - Configuration options
   - Usage examples
   - Dependencies
3. Generate clear, concise documentation
4. Use appropriate format (JSDoc, Markdown, etc.)`,
    triggers: [
      { type: 'keyword', value: 'document' },
      { type: 'keyword', value: 'docs' },
      { type: 'keyword', value: 'readme' },
    ],
    async execute(context: SkillContext, input: Record<string, unknown>): Promise<SkillResult> {
      return {
        success: true,
        output: 'Please specify which code or project you would like me to document. I will generate clear and comprehensive documentation.',
      };
    },
  };
}

export function createRefactorSkill(): Skill {
  return {
    name: 'refactor',
    description: 'Refactor code for better quality',
    instructions: `When refactoring code:
1. Understand the current code structure
2. Identify improvement opportunities:
   - Extract repeated code into functions
   - Simplify complex conditionals
   - Improve naming
   - Remove dead code
   - Apply design patterns where appropriate
3. Make changes incrementally
4. Verify each change doesn't break functionality`,
    triggers: [
      { type: 'keyword', value: 'refactor' },
      { type: 'keyword', value: 'clean up' },
      { type: 'keyword', value: 'improve' },
    ],
    async execute(context: SkillContext, input: Record<string, unknown>): Promise<SkillResult> {
      return {
        success: true,
        output: 'Please specify which code you would like me to refactor. I will help improve its quality and maintainability.',
      };
    },
  };
}

export function createBuiltinSkills(): Skill[] {
  return [
    createGitCommitSkill(),
    createTestRunnerSkill(),
    createCodeReviewSkill(),
    createDocumentationSkill(),
    createRefactorSkill(),
  ];
}
