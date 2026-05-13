import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatTreeDiagram,
  readTreeNodes,
  type TreeDiagramDirection,
  type TreeDiagramFormat
} from "@abstraction-tree/core";

export interface TreeExportCommandOptions {
  projectRoot: string;
  format?: unknown;
  output?: string;
  direction?: unknown;
  withSummaries?: boolean;
}

export interface TreeExportCommandIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const diagramFormats = new Set<TreeDiagramFormat>(["mermaid", "dot"]);
const diagramDirections = new Set<TreeDiagramDirection>(["TD", "TB", "BT", "LR", "RL"]);

export async function runTreeExportCommand(
  options: TreeExportCommandOptions,
  io: TreeExportCommandIo = defaultIo
): Promise<number> {
  const format = parseFormat(options.format);
  if (!format) {
    io.stderr("Export format must be either `mermaid` or `dot`.");
    return 1;
  }

  const direction = parseDirection(options.direction);
  if (options.direction !== undefined && !direction) {
    io.stderr("Export direction must be one of TD, TB, BT, LR, or RL.");
    return 1;
  }

  const nodes = await readTreeNodes(options.projectRoot);
  if (!nodes.length) {
    io.stderr("No tree memory found. Run `atree scan` before exporting.");
    return 1;
  }

  const content = formatTreeDiagram(nodes, format, {
    direction,
    includeSummaries: Boolean(options.withSummaries)
  });

  if (!options.output) {
    io.stdout(content);
    return 0;
  }

  const outputPath = path.resolve(options.projectRoot, options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
  io.stdout(`Wrote ${format} tree diagram to ${relativePath(options.projectRoot, outputPath)}\n`);
  return 0;
}

function parseFormat(input: unknown): TreeDiagramFormat | undefined {
  const value = String(input ?? "mermaid").toLowerCase();
  return diagramFormats.has(value as TreeDiagramFormat) ? value as TreeDiagramFormat : undefined;
}

function parseDirection(input: unknown): TreeDiagramDirection | undefined {
  if (input === undefined) return undefined;
  const value = String(input).toUpperCase();
  return diagramDirections.has(value as TreeDiagramDirection) ? value as TreeDiagramDirection : undefined;
}

function relativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

const defaultIo: TreeExportCommandIo = {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(`${text}\n`)
};
