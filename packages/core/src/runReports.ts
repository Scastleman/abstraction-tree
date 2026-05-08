export type RunReportResult = "success" | "partial" | "failed" | "no-op" | "unknown";

export interface RunMarkdownSummary {
  task?: string;
  result?: Exclude<RunReportResult, "unknown">;
}

export function summarizeRunMarkdown(text: string): RunMarkdownSummary {
  return {
    task: firstMarkdownLine(markdownSection(text, "Task") || markdownSection(text, "Task Chosen")),
    result: parseRunResult(markdownSection(text, "Result"))
  };
}

function markdownSection(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^## ${escaped}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))?.[1] ?? "";
}

function firstMarkdownLine(text: string): string | undefined {
  return text.split(/\r?\n/).map(line => line.trim()).find(Boolean);
}

function parseRunResult(text: string): RunMarkdownSummary["result"] {
  const firstValue = firstMarkdownLine(text)?.toLowerCase();
  if (!firstValue) return undefined;
  if (firstValue.startsWith("success")) return "success";
  if (firstValue.startsWith("partial")) return "partial";
  if (firstValue.startsWith("failed") || firstValue.startsWith("failure")) return "failed";
  if (firstValue.startsWith("no-op") || firstValue.startsWith("noop") || firstValue.startsWith("no op")) return "no-op";
  return undefined;
}
