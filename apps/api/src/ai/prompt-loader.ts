import { readFileSync } from "fs";
import { join } from "path";

const cache = new Map<string, string>();

function readFile(filename: string): string {
  if (!cache.has(filename)) {
    cache.set(
      filename,
      readFileSync(join(__dirname, "prompts", filename), "utf-8"),
    );
  }
  return cache.get(filename)!;
}

/** Load a static prompt file (no variable substitution). */
export function loadPrompt(filename: string): string {
  return readFile(filename).trim();
}

/** Render a template with {{var}} placeholders and {{#if var}}...{{/if}} conditionals. */
export function renderTemplate(
  filename: string,
  vars: Record<string, string>,
): string {
  let result = readFile(filename);

  // Process {{#if var}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName: string, content: string) => {
      const value = vars[varName];
      if (value !== undefined && value !== "") {
        return content;
      }
      return "";
    },
  );

  // Replace {{var}} placeholders
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  // Collapse blank lines left by removed conditional blocks
  return result.replace(/\n{2,}/g, "\n").trim();
}
