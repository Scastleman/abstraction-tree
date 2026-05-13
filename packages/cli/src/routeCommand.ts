import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  atreePath,
  formatPromptRouteResult,
  readJson,
  routePrompt,
  type Concept,
  type FileSummary,
  type Invariant,
  type PromptRouteResult,
  type TreeNode
} from "@abstraction-tree/core";

export interface RouteCommandOptions {
  projectRoot: string;
  file?: string;
  text?: string;
  json?: boolean;
  explain?: boolean;
}

export interface RouteCommandIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface PromptRouteMemory {
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  invariants: Invariant[];
  memoryAvailable: boolean;
  memoryIssues: string[];
}

export async function runRouteCommand(
  options: RouteCommandOptions,
  io: RouteCommandIo = defaultIo
): Promise<number> {
  const source = await readPromptSource(options);
  if ("error" in source) {
    io.stderr(source.error);
    return 1;
  }

  const memory = await readPromptRouteMemory(options.projectRoot);
  const result = routePrompt({
    prompt: source.prompt,
    promptFile: source.promptFile,
    ...memory
  });
  io.stdout(options.json
    ? `${JSON.stringify(toRouteJson(result), null, 2)}\n`
    : formatPromptRouteResult(result, { explain: Boolean(options.explain) }));
  return 0;
}

export async function readPromptRouteMemory(projectRoot: string): Promise<PromptRouteMemory> {
  const root = path.resolve(projectRoot);
  const memoryIssues: string[] = [];
  const [nodes, files, concepts, invariants] = await Promise.all([
    readMemoryArray<TreeNode>(root, "tree.json", memoryIssues),
    readMemoryArray<FileSummary>(root, "files.json", memoryIssues),
    readMemoryArray<Concept>(root, "concepts.json", memoryIssues),
    readMemoryArray<Invariant>(root, "invariants.json", memoryIssues)
  ]);
  return {
    nodes,
    files,
    concepts,
    invariants,
    memoryAvailable: nodes.length > 0 || files.length > 0 || concepts.length > 0 || invariants.length > 0,
    memoryIssues
  };
}

export function toRouteJson(result: PromptRouteResult) {
  return {
    decision: result.decision,
    confidence: result.confidence,
    estimated_risk: result.estimatedRisk,
    estimated_complexity: result.estimatedComplexity,
    estimated_affected_layers: result.estimatedAffectedLayers,
    estimated_affected_nodes: result.estimatedAffectedNodes,
    estimated_affected_concepts: result.estimatedAffectedConcepts,
    estimated_files: result.estimatedFiles,
    reasons: result.reasons,
    recommended_command: result.recommendedCommand
  };
}

async function readPromptSource(options: RouteCommandOptions): Promise<
  | { prompt: string; promptFile?: string }
  | { error: string }
> {
  if (options.file && options.text) return { error: "Use either --file or --text, not both." };
  if (!options.file && !options.text) return { error: "Provide a prompt with --file prompt.md or --text \"Fix the bug\"." };
  if (options.text !== undefined) {
    const prompt = options.text.trim();
    return prompt ? { prompt } : { error: "Prompt text must not be empty." };
  }

  const projectRoot = path.resolve(options.projectRoot);
  const promptPath = path.resolve(projectRoot, options.file ?? "");
  if (!existsSync(promptPath)) {
    return { error: `Prompt file not found: ${normalizePath(path.relative(projectRoot, promptPath))}` };
  }

  const prompt = await readFile(promptPath, "utf8");
  if (!prompt.trim()) return { error: "Prompt file is empty." };
  return {
    prompt,
    promptFile: relativeOrAbsolute(projectRoot, promptPath)
  };
}

async function readMemoryArray<T>(projectRoot: string, name: string, issues: string[]): Promise<T[]> {
  const filePath = atreePath(projectRoot, name);
  if (!existsSync(filePath)) {
    issues.push(`${name} is missing.`);
    return [];
  }

  try {
    const value = await readJson<unknown>(filePath, []);
    if (Array.isArray(value)) return value as T[];
    issues.push(`${name} is not an array.`);
    return [];
  } catch {
    issues.push(`${name} could not be read as JSON.`);
    return [];
  }
}

function relativeOrAbsolute(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return normalizePath(relative);
  return normalizePath(filePath);
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

const defaultIo: RouteCommandIo = {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(`${text}\n`)
};
