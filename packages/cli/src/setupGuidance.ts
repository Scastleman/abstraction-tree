import type { AtreeConfig, InstallMode } from "@abstraction-tree/core";

export function formatInitGuidance(mode: InstallMode, projectInput?: string): string[] {
  const projectArg = formatProjectArg(projectInput);
  if (mode === "full") {
    return [
      "Next:",
      `  atree scan --project ${projectArg}`,
      `  atree serve --project ${projectArg} --open`
    ];
  }

  return [
    "Core-only mode writes .abstraction-tree data and supports scan, validate, and context commands.",
    "To enable the visual app later:",
    `  atree mode full --project ${projectArg}`,
    `  atree serve --project ${projectArg} --open`
  ];
}

export function formatScanGuidance(config: AtreeConfig, projectInput?: string): string[] {
  const projectArg = formatProjectArg(projectInput);
  if (config.installMode === "full" && config.visualApp?.enabled) {
    return [
      "View the project map:",
      `  atree serve --project ${projectArg} --open`
    ];
  }

  return [
    "Core mode is active. To enable the visual app:",
    `  atree mode full --project ${projectArg}`,
    `  atree serve --project ${projectArg} --open`
  ];
}

function formatProjectArg(projectInput?: string): string {
  const value = projectInput?.trim() || ".";
  return quoteCommandArg(value);
}

function quoteCommandArg(value: string): string {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replaceAll("\"", "\\\"")}"`;
}
