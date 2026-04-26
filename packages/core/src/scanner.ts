import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FileSummary } from "./schema.js";
import { readConfig } from "./workspace.js";

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript React",
  ".js": "JavaScript",
  ".jsx": "JavaScript React",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".cpp": "C++",
  ".hpp": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".cs": "C#",
  ".java": "Java",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".md": "Markdown",
  ".sql": "SQL"
};

const TEXT_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXT));

export interface ScanResult {
  files: FileSummary[];
}

export async function scanProject(projectRoot: string): Promise<ScanResult> {
  const config = await readConfig(projectRoot);
  const ignored = new Set(config.ignored);
  const files: FileSummary[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(projectRoot, abs).replaceAll(path.sep, "/");
      if (ignored.has(entry.name) || [...ignored].some(i => rel === i || rel.startsWith(i + "/"))) continue;
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        const s = await stat(abs);
        if (s.size > 512_000) continue;
        const text = await readFile(abs, "utf8").catch(() => "");
        files.push(summarizeFile(rel, ext, text, s.size));
      }
    }
  }

  await walk(projectRoot);
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

export function summarizeFile(filePath: string, extension: string, text: string, sizeBytes: number): FileSummary {
  const lines = text.split(/\r?\n/);
  const imports = extractMatches(text, [
    /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /require\(["']([^"']+)["']\)/g,
    /^from\s+([\w.]+)\s+import\s+/gm,
    /^import\s+([\w.]+)/gm,
    /^#include\s+[<"]([^>"]+)[>"]/gm
  ]);
  const exports = extractMatches(text, [
    /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+([A-Za-z0-9_]+)/g,
    /module\.exports\s*=\s*([A-Za-z0-9_]+)/g
  ]);
  const symbols = extractMatches(text, [
    /(?:class|interface|type|function)\s+([A-Za-z0-9_]+)/g,
    /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g,
    /^def\s+([A-Za-z0-9_]+)\s*\(/gm,
    /^class\s+([A-Za-z0-9_]+)/gm,
    /func\s+([A-Za-z0-9_]+)\s*\(/g
  ]).slice(0, 40);

  const isTest = /(^|\/)(__tests__|tests?|spec)\//i.test(filePath) || /\.(test|spec)\.[tj]sx?$/.test(filePath);
  const language = LANGUAGE_BY_EXT[extension] ?? "Text";
  const summary = inferSummary(filePath, language, symbols, imports, isTest);

  return {
    path: filePath,
    extension,
    language,
    sizeBytes,
    lines: lines.length,
    imports,
    exports,
    symbols,
    isTest,
    summary,
    ownedByNodeIds: []
  };
}

function extractMatches(text: string, regexes: RegExp[]): string[] {
  const out = new Set<string>();
  for (const regex of regexes) {
    for (const m of text.matchAll(regex)) {
      if (m[1]) out.add(m[1]);
    }
  }
  return [...out].slice(0, 80);
}

function inferSummary(filePath: string, language: string, symbols: string[], imports: string[], isTest: boolean): string {
  const name = path.basename(filePath);
  const role = isTest ? "test coverage" : filePath.includes("config") ? "configuration" : filePath.includes("schema") ? "data/schema" : "implementation";
  const symbolText = symbols.length ? ` Defines ${symbols.slice(0, 5).join(", ")}.` : "";
  const importText = imports.length ? ` Depends on ${imports.slice(0, 4).join(", ")}.` : "";
  return `${name} is a ${language} ${role} file.${symbolText}${importText}`;
}
