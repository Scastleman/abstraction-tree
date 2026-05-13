import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const missionCategoryDescriptions = {
  "product-value": "improves capabilities or outcomes for project users/adopters.",
  safety: "reduces overreach, security, sandbox, data-loss, or operational risk.",
  quality: "improves correctness, validation, test coverage, drift detection, or reliability.",
  "developer-experience": "improves docs, diagnostics, ergonomics, or maintainer workflow.",
  "automation-maintenance": "maintains loop, runner, prompt, runtime, or process automation machinery without a clearer product, safety, quality, or developer-experience outcome."
};

export const validMissionCategories = new Set(Object.keys(missionCategoryDescriptions));
export const validMissionPriorities = new Set(["P0", "P1", "P2", "P3"]);
export const validMissionRisks = new Set(["low", "medium", "high"]);
export const requiredMissionStringFields = ["id", "title", "priority", "risk", "category", "parallelGroup"];
export const requiredMissionArrayFields = ["affectedFiles", "affectedNodes", "dependsOn"];
export const requiredMissionBooleanFields = ["parallelGroupSafe"];
export const requiredMissionBodyHeadings = [
  "# Mission",
  "## Goal",
  "## Abstraction Tree Position",
  "## Why This Matters",
  "## Scope",
  "## Out of Scope",
  "## Required Checks",
  "## Success Criteria"
];

export function parseMissionMarkdown(markdown) {
  const cleanMarkdown = markdown.replace(/^\uFEFF/u, "");
  if (!cleanMarkdown.startsWith("---")) return { hasFrontmatter: false, frontmatter: {}, body: cleanMarkdown };
  const lines = cleanMarkdown.split(/\r?\n/u);
  if (lines[0].trim() !== "---") return { hasFrontmatter: false, frontmatter: {}, body: markdown };

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) return { hasFrontmatter: false, frontmatter: {}, body: markdown };

  const frontmatterText = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").replace(/^\s*\n/u, "");
  return {
    hasFrontmatter: true,
    frontmatter: parseSimpleFrontmatter(frontmatterText),
    body
  };
}

export function parseSimpleFrontmatter(text) {
  const result = {};
  const lines = text.split(/\r?\n/u);
  let currentArrayKey;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/u, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const arrayItem = line.match(/^\s*-\s*(.*)$/u);
    if (arrayItem && currentArrayKey) {
      result[currentArrayKey].push(unquote(arrayItem[1].trim()));
      continue;
    }

    currentArrayKey = undefined;
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!field) continue;

    const key = field[1];
    const value = field[2].trim();
    if (value === "[]") {
      result[key] = [];
      continue;
    }
    if (!value) {
      result[key] = [];
      currentArrayKey = key;
      continue;
    }
    if (value === "true") {
      result[key] = true;
      continue;
    }
    if (value === "false") {
      result[key] = false;
      continue;
    }
    result[key] = unquote(value);
  }

  return result;
}

export function validateMissionFrontmatter(frontmatter, missionLabel = "mission", options = {}) {
  const mission = {};
  const stringFields = options.requiredStringFields ?? requiredMissionStringFields;
  const arrayFields = options.requiredArrayFields ?? requiredMissionArrayFields;
  const booleanFields = options.requiredBooleanFields ?? requiredMissionBooleanFields;
  for (const field of stringFields) {
    mission[field] = requiredString(frontmatter, field, missionLabel);
  }
  for (const field of arrayFields) {
    mission[field] = requiredArray(frontmatter, field, missionLabel);
  }
  for (const field of booleanFields) {
    if (!Object.hasOwn(frontmatter, field)) {
      throw new Error(`${missionLabel} is missing required frontmatter field ${field}.`);
    }
    if (typeof frontmatter[field] !== "boolean") {
      throw new Error(`${missionLabel} frontmatter field ${field} must be boolean true or false.`);
    }
    mission[field] = frontmatter[field];
  }

  if (!validMissionPriorities.has(mission.priority)) {
    throw new Error(`${missionLabel} frontmatter field priority must be one of: ${formatSet(validMissionPriorities)}.`);
  }
  if (!validMissionRisks.has(mission.risk)) {
    throw new Error(`${missionLabel} frontmatter field risk must be one of: ${formatSet(validMissionRisks)}.`);
  }
  if (!validMissionCategories.has(mission.category)) {
    throw new Error(`${missionLabel} frontmatter field category must be one of: ${formatSet(validMissionCategories)}.`);
  }

  return mission;
}

export function validateMissionBody(body, missionLabel = "mission", options = {}) {
  const requiredHeadings = options.requiredHeadings ?? requiredMissionBodyHeadings;
  const headings = new Set(body.split(/\r?\n/u).map(line => line.trim()));
  for (const heading of requiredHeadings) {
    if (!headings.has(heading)) {
      throw new Error(`${missionLabel} is missing required body heading ${heading}.`);
    }
  }
  return { headings: [...headings].filter(line => line.startsWith("#")) };
}

export function validateMissionMarkdown(markdown, missionLabel = "mission", options = {}) {
  const strict = options.strict ?? true;
  const parsed = parseMissionMarkdown(markdown);
  if (!parsed.hasFrontmatter) {
    throw new Error(`${missionLabel} is missing frontmatter delimited by ---.`);
  }

  const frontmatter = validateMissionFrontmatter(parsed.frontmatter, missionLabel, options);
  if (strict) validateMissionBody(parsed.body, missionLabel, options);
  return {
    ...parsed,
    frontmatter
  };
}

export async function validateMissionFolder(input) {
  const root = path.resolve(input.root ?? process.cwd());
  const folder = path.resolve(root, input.folder);
  const strict = input.strict ?? true;
  const files = await missionMarkdownFiles(folder);
  const missions = [];
  const ids = new Map();

  for (const filePath of files) {
    const label = normalizePath(path.relative(root, filePath));
    const markdown = await readFile(filePath, "utf8");
    const validation = validateMissionMarkdown(markdown, label, { ...input, strict });
    const existing = ids.get(validation.frontmatter.id);
    if (existing) {
      throw new Error(`Mission id ${validation.frontmatter.id} is duplicated in ${existing} and ${label}.`);
    }
    ids.set(validation.frontmatter.id, label);
    missions.push({
      ...validation.frontmatter,
      path: filePath,
      relativePath: normalizePath(path.relative(folder, filePath)),
      label,
      body: validation.body
    });
  }

  return missions;
}

async function missionMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await missionMarkdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && entry.name.toLowerCase() !== "readme.md") {
      files.push(absolutePath);
    }
  }
  return files.sort(comparePaths);
}

function requiredString(frontmatter, field, missionLabel) {
  if (!Object.hasOwn(frontmatter, field)) {
    throw new Error(`${missionLabel} is missing required frontmatter field ${field}.`);
  }
  const value = frontmatter[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${missionLabel} frontmatter field ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredArray(frontmatter, field, missionLabel) {
  if (!Object.hasOwn(frontmatter, field)) {
    throw new Error(`${missionLabel} is missing required frontmatter field ${field}.`);
  }
  if (!Array.isArray(frontmatter[field])) {
    throw new Error(`${missionLabel} frontmatter field ${field} must be an array.`);
  }
  return frontmatter[field];
}

function unquote(value) {
  return value.replace(/^["']|["']$/gu, "");
}

function formatSet(values) {
  return [...values].join(", ");
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function comparePaths(left, right) {
  return normalizePath(left).localeCompare(normalizePath(right));
}
