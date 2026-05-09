import type {
  Skill,
  SkillDefinition,
  SkillContext,
  SkillResult,
} from "./types.js";

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): void {
    this.skills.delete(name);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values()).map(
      ({ name, description, instructions, resources, triggers, metadata }) => ({
        name,
        description,
        instructions,
        resources,
        triggers,
        metadata,
      }),
    );
  }

  findByTrigger(input: string): Skill[] {
    const results: Skill[] = [];
    const lowerInput = input.toLowerCase();

    for (const skill of this.skills.values()) {
      if (!skill.triggers) continue;

      for (const trigger of skill.triggers) {
        switch (trigger.type) {
          case "keyword":
            if (lowerInput.includes(trigger.value.toLowerCase())) {
              results.push(skill);
            }
            break;
          case "pattern":
            try {
              const regex = new RegExp(trigger.value, "i");
              if (regex.test(input)) {
                results.push(skill);
              }
            } catch {
              // Invalid regex
            }
            break;
          case "intent":
            // Simple intent matching
            if (this.matchIntent(trigger.value, lowerInput)) {
              results.push(skill);
            }
            break;
        }
      }
    }

    return results;
  }

  async execute(
    name: string,
    context: SkillContext,
    input: Record<string, unknown>,
  ): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      return {
        success: false,
        output: `Skill "${name}" not found`,
      };
    }

    try {
      return await skill.execute(context, input);
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private matchIntent(intent: string, input: string): boolean {
    const intentKeywords: Record<string, string[]> = {
      "create-file": ["create", "new file", "make file", "write file"],
      "read-file": ["read", "show", "display", "view", "open"],
      "edit-file": ["edit", "modify", "change", "update", "fix"],
      "run-command": ["run", "execute", "start", "launch"],
      search: ["find", "search", "look for", "grep"],
      test: ["test", "check", "verify", "validate"],
      build: ["build", "compile", "bundle", "package"],
      deploy: ["deploy", "publish", "release", "ship"],
    };

    const keywords = intentKeywords[intent] ?? [intent];
    return keywords.some((kw) => input.includes(kw));
  }
}
