#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const assessmentPackRoot = ".abstraction-tree/assessment-packs";
export const defaultMaxBytesPerArtifact = 50_000;
export const defaultMaxTotalBytes = 250_000;

export const defaultRedactionPatternDefinitions = [
  {
    label: "secret-assignment",
    description: "Assignments for keys ending in TOKEN, SECRET, or API_KEY, including OPENAI_API_KEY and GITHUB_TOKEN.",
    regex: /\b([A-Z0-9_]*(?:TOKEN|SECRET|API_KEY)\b["']?\s*[:=]\s*["']?)([^"'\s,;]+)/gi,
    replacement: "$1[REDACTED]"
  },
  {
    label: "authorization-bearer",
    description: "Authorization: Bearer credential headers.",
    regex: /\b(Authorization\s*:\s*Bearer\s+)([^\s"'`,;]+)/gi,
    replacement: "$1[REDACTED]"
  }
];

export const requiredPackFiles = [
  "assessment-prompt.md",
  "repo-summary.json",
  "pack-safety.json",
  "tree-summary.md",
  "latest-evaluation.json",
  "diff-summary.md",
  "latest-runs.md",
  "latest-lessons.md",
  "mission-authoring-schema.md"
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function runCli(argv = [], io = {}) {
  const cwd = path.resolve(io.cwd ?? process.cwd());
  const stdout = io.stdout ?? process.stdout;
  const options = parseArgs(argv);
  const result = await createAssessmentPack({
    cwd,
    outputRoot: options.outputRoot,
    maxBytesPerArtifact: options.maxBytesPerArtifact,
    maxTotalBytes: options.maxTotalBytes,
    redactPatterns: options.redactPatterns,
    redactFiles: options.redactFiles,
    includeDiff: options.includeDiff,
    includeRuns: options.includeRuns,
    includeLessons: options.includeLessons,
    includeMissionRuntime: options.includeMissionRuntime,
    createdAt: io.now ?? new Date(),
    runCommand: io.command ?? command
  });

  stdout.write(`Assessment pack created: ${relative(cwd, result.packDir)}\n`);
  stdout.write(`Assessment prompt: ${relative(cwd, path.join(result.packDir, "assessment-prompt.md"))}\n`);
  stdout.write(`Pack safety: ${relative(cwd, path.join(result.packDir, "pack-safety.json"))}\n`);
  if (result.safety.noticeCount > 0) {
    stdout.write(`Safety notices: ${result.safety.noticeCount} redaction/truncation/omission notice(s). Review pack-safety.json before sharing.\n`);
  }
  return result;
}

export function parseArgs(argv = []) {
  const options = {
    outputRoot: assessmentPackRoot,
    maxBytesPerArtifact: defaultMaxBytesPerArtifact,
    maxTotalBytes: defaultMaxTotalBytes,
    redactPatterns: [],
    redactFiles: [],
    includeDiff: true,
    includeRuns: true,
    includeLessons: true,
    includeMissionRuntime: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output-root") {
      options.outputRoot = valueAt(argv, index + 1, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-bytes-per-artifact") {
      options.maxBytesPerArtifact = parsePositiveInteger(valueAt(argv, index + 1, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--max-total-bytes") {
      options.maxTotalBytes = parsePositiveInteger(valueAt(argv, index + 1, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--redact") {
      options.redactPatterns.push(valueAt(argv, index + 1, arg));
      index += 1;
      continue;
    }
    if (arg === "--redact-file") {
      options.redactFiles.push(valueAt(argv, index + 1, arg));
      index += 1;
      continue;
    }
    if (arg === "--no-diff") {
      options.includeDiff = false;
      continue;
    }
    if (arg === "--no-runs") {
      options.includeRuns = false;
      continue;
    }
    if (arg === "--no-lessons") {
      options.includeLessons = false;
      continue;
    }
    if (arg === "--no-mission-runtime") {
      options.includeMissionRuntime = false;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export async function createAssessmentPack(input = {}) {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const createdAt = input.createdAt ?? new Date();
  const outputRoot = input.outputRoot ?? assessmentPackRoot;
  const runCommand = input.runCommand ?? command;
  const safetyOptions = await prepareSafetyOptions(cwd, input);
  const packDir = path.join(cwd, outputRoot, timestampForPath(createdAt));

  await mkdir(packDir, { recursive: true });

  const context = await collectAssessmentPackContext(cwd, runCommand, createdAt, safetyOptions);
  const packRelativeDir = relative(cwd, packDir);
  const safetyState = createSafetyState(cwd, packRelativeDir, safetyOptions);
  addConfiguredOmissions(safetyState, safetyOptions);

  const artifactTexts = [
    ["repo-summary.json", jsonText(buildRepoSummary(context, packRelativeDir))],
    ["tree-summary.md", buildTreeSummary(context)],
    ["latest-evaluation.json", jsonText(latestEvaluationArtifact(context.latestEvaluation))],
    [
      "diff-summary.md",
      safetyOptions.includeDiff
        ? buildDiffSummaryMarkdown(context.diffSummary)
        : buildOmittedMarkdown("Diff Summary", "Omitted because --no-diff was passed.")
    ],
    [
      "latest-runs.md",
      safetyOptions.includeRuns
        ? buildLatestMarkdown("Latest Runs", context.latestRuns, ".abstraction-tree/runs/*.md")
        : buildOmittedMarkdown("Latest Runs", "Omitted because --no-runs was passed.")
    ],
    [
      "latest-lessons.md",
      safetyOptions.includeLessons
        ? buildLatestMarkdown("Latest Lessons", context.latestLessons, ".abstraction-tree/lessons/*.md")
        : buildOmittedMarkdown("Latest Lessons", "Omitted because --no-lessons was passed.")
    ],
    ["mission-authoring-schema.md", buildMissionAuthoringSchema()]
  ];

  for (const [file, text] of artifactTexts) {
    await writeRedactedTextArtifact({
      filePath: path.join(packDir, file),
      artifact: file,
      text,
      safetyState
    });
  }

  await writeRedactedTextArtifact({
    filePath: path.join(packDir, "assessment-prompt.md"),
    artifact: "assessment-prompt.md",
    text: buildAssessmentPrompt({
      packRelativeDir,
      createdAt,
      context,
      safety: buildPromptSafetySummary(safetyState, safetyOptions)
    }),
    safetyState
  });

  const packSafety = buildPackSafetyArtifact(safetyState, createdAt);
  await writeJson(path.join(packDir, "pack-safety.json"), packSafety);

  return {
    packDir,
    files: requiredPackFiles.map(file => path.join(packDir, file)),
    context,
    safety: packSafety
  };
}

export async function collectAssessmentPackContext(cwd, runCommand = command, createdAt = new Date(), options = {}) {
  const safetyOptions = normalizeSafetyOptions(options);
  const [
    packageJson,
    config,
    tree,
    files,
    concepts,
    gitStatus,
    gitHead,
    diffSummary,
    changeReview,
    latestEvaluation,
    latestRuns,
    latestLessons,
    missionRuntime
  ] = await Promise.all([
    readJsonArtifact(cwd, "package.json"),
    readJsonArtifact(cwd, ".abstraction-tree/config.json"),
    readJsonArtifact(cwd, ".abstraction-tree/tree.json"),
    readJsonArtifact(cwd, ".abstraction-tree/files.json"),
    readJsonArtifact(cwd, ".abstraction-tree/concepts.json"),
    runCommand("git", ["status", "--short", "--branch"], { cwd, allowFailure: true }),
    runCommand("git", ["log", "--oneline", "-1"], { cwd, allowFailure: true }),
    safetyOptions.includeDiff ? diffSummaryCommand(cwd, runCommand) : omittedCommandArtifact("--no-diff", "Diff summary collection was disabled."),
    changeReviewCommand(cwd, runCommand),
    readLatestJsonFile(cwd, ".abstraction-tree/evaluations"),
    safetyOptions.includeRuns ? readLatestMarkdownFiles(cwd, ".abstraction-tree/runs", 3) : [],
    safetyOptions.includeLessons ? readLatestMarkdownFiles(cwd, ".abstraction-tree/lessons", 5) : [],
    safetyOptions.includeMissionRuntime
      ? readJsonArtifact(cwd, ".abstraction-tree/automation/mission-runtime.json")
      : omittedJsonArtifact(".abstraction-tree/automation/mission-runtime.json", "--no-mission-runtime")
  ]);

  return {
    createdAt: createdAt.toISOString(),
    packageJson,
    memory: {
      config,
      tree,
      files,
      concepts
    },
    git: {
      status: commandOutput(gitStatus),
      head: commandOutput(gitHead)
    },
    diffSummary,
    latestEvaluation,
    latestRuns,
    latestLessons,
    missionRuntime,
    changeReview
  };
}

export function buildAssessmentPrompt(input) {
  return `# ChatGPT/Human Assessment Prompt

This is a ChatGPT-first or human-first strategy pass for Abstraction Tree. Use this evidence pack to produce the broad repository assessment and mission authoring. Codex should execute bounded mission files after this strategy is complete; Codex should not author the strategic assessment.

Evidence pack: \`${input.packRelativeDir}\`
Created: ${input.createdAt.toISOString()}

## Strategy And Execution Boundary

- ChatGPT or a human reviewer owns strategic assessment, architectural critique, prioritization, and mission authoring.
- Codex owns execution of already-authored bounded missions.
- Do not ask Codex to perform the broad repository assessment.
- Do not execute missions as part of this assessment.
- Keep recommendations grounded in the evidence files in this pack.

## Evidence Files

- \`repo-summary.json\`: package, Git status, mission runtime, change-record review, and compact source availability.
- \`pack-safety.json\`: redaction, omission, truncation, and approximate byte-size metadata.
- \`tree-summary.md\`: relevant abstraction memory summaries from config, tree, files, and concepts.
- \`latest-evaluation.json\`: latest deterministic evaluation, or a missing-artifact marker.
- \`diff-summary.md\`: current Git diff summary, or a command failure note.
- \`latest-runs.md\`: recent durable run reports.
- \`latest-lessons.md\`: recent reusable lessons.
- \`mission-authoring-schema.md\`: mission frontmatter and body contract.

${buildAssessmentPromptSafetySection(input.safety)}

## Required Output

Produce Markdown content for:

1. A thoughtful repository assessment.
2. Prioritized change recommendations.
3. A mission folder with \`README.md\` and small mission Markdown files using the schema in \`mission-authoring-schema.md\`.
4. Explicit notes separating strategy decisions from Codex execution work.

## Assessment Requirements

Assess the current project against this goal:

Integrate an abstraction tree into any project so developers understand prompt scope, agents avoid unnecessary overreach, and the project supports bounded self-improvement.

For each recommendation:

- explain the user or maintainer value;
- identify likely affected abstraction-tree level: project, architecture, module, file, function, schema, cli, docs, or tests;
- rank priority and risk;
- state whether it should become a Codex mission or remain a human strategy decision.

## Mission Requirements

Use the mission schema exactly. Prefer missions that are small, testable, independently useful, and safe for Codex to execute. Product value, safety, quality, and developer experience should outrank process-only automation maintenance unless automation maintenance is the clearest repository value.
`;
}

export function buildRepoSummary(context, packRelativeDir = "") {
  const packageValue = objectValue(context.packageJson.value);
  const configValue = objectValue(context.memory.config.value);
  const treeNodes = arrayValue(context.memory.tree.value);
  const fileEntries = arrayValue(context.memory.files.value);
  const conceptEntries = arrayValue(context.memory.concepts.value);
  const latestEvaluationSource = context.latestEvaluation.available ? context.latestEvaluation.path : "";

  return {
    createdAt: context.createdAt,
    pack: packRelativeDir,
    project: {
      packageName: stringValue(packageValue.name),
      packageVersion: stringValue(packageValue.version),
      abstractionTreeProjectName: stringValue(configValue.projectName),
      abstractionTreeVersion: stringValue(configValue.version),
      sourceRoot: stringValue(configValue.sourceRoot)
    },
    git: context.git,
    sources: {
      latestEvaluation: latestEvaluationSource || "missing",
      latestRuns: context.latestRuns.map(file => file.path),
      latestLessons: context.latestLessons.map(file => file.path),
      missionRuntime: context.missionRuntime.available ? context.missionRuntime.path : "missing",
      changeReview: context.changeReview.source,
      diffSummary: context.diffSummary.source
    },
    counts: {
      treeNodes: treeNodes.length,
      files: fileEntries.length,
      concepts: conceptEntries.length,
      latestRuns: context.latestRuns.length,
      latestLessons: context.latestLessons.length
    },
    missionRuntime: context.missionRuntime,
    changeReview: context.changeReview,
    optionalArtifacts: {
      latestEvaluationAvailable: context.latestEvaluation.available,
      missionRuntimeAvailable: context.missionRuntime.available,
      latestRunsAvailable: context.latestRuns.length > 0,
      latestLessonsAvailable: context.latestLessons.length > 0,
      diffSummarySucceeded: context.diffSummary.exitCode === 0,
      changeReviewSucceeded: context.changeReview.exitCode === 0
    }
  };
}

export function buildTreeSummary(context) {
  const config = objectValue(context.memory.config.value);
  const nodes = arrayValue(context.memory.tree.value);
  const files = arrayValue(context.memory.files.value);
  const concepts = arrayValue(context.memory.concepts.value);
  const lines = [
    "# Tree Summary",
    "",
    "## Project Memory",
    "",
    `- Project: ${stringValue(config.projectName) || "unknown"}`,
    `- Memory version: ${stringValue(config.version) || "unknown"}`,
    `- Source root: ${stringValue(config.sourceRoot) || "unknown"}`,
    `- Tree builder: ${stringValue(config.treeBuilder) || "unknown"}`,
    `- Install mode: ${stringValue(config.installMode) || "unknown"}`,
    "",
    "## Inventory",
    "",
    `- Tree nodes: ${nodes.length}`,
    `- File records: ${files.length}`,
    `- Concepts: ${concepts.length}`,
    "",
    "## Top-Level Nodes",
    ""
  ];

  const topLevel = nodes.filter(node => !node.parent && !node.parentId).slice(0, 12);
  appendNodeLines(lines, topLevel);

  lines.push("", "## Architecture Nodes", "");
  appendNodeLines(lines, nodes.filter(node => stringValue(node.id).startsWith("architecture.")).slice(0, 20));

  lines.push("", "## Module Nodes", "");
  appendNodeLines(lines, nodes.filter(node => stringValue(node.id).startsWith("module.")).slice(0, 20));

  lines.push("", "## Prominent Concepts", "");
  const prominentConcepts = [...concepts]
    .sort((left, right) => conceptScore(right) - conceptScore(left) || stringValue(left.id).localeCompare(stringValue(right.id)))
    .slice(0, 15);
  if (!prominentConcepts.length) {
    lines.push("- No concept records found.");
  } else {
    for (const concept of prominentConcepts) {
      const id = stringValue(concept.id) || "unknown";
      const title = stringValue(concept.title) || id;
      const summary = stringValue(concept.summary);
      const relatedFiles = arrayValue(concept.relatedFiles).length;
      lines.push(`- ${id}: ${title}${summary ? ` - ${summary}` : ""} (${relatedFiles} related file(s))`);
    }
  }

  lines.push("", "## File Language Summary", "");
  const languageCounts = countBy(files, file => stringValue(file.language) || "unknown");
  const languageEntries = [...languageCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (!languageEntries.length) {
    lines.push("- No file records found.");
  } else {
    for (const [language, count] of languageEntries.slice(0, 20)) {
      lines.push(`- ${language}: ${count}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildDiffSummaryMarkdown(diffSummary) {
  const lines = [
    "# Diff Summary",
    "",
    `Source: ${diffSummary.source}`,
    `Exit code: ${diffSummary.exitCode}`,
    ""
  ];

  if (diffSummary.exitCode !== 0) {
    lines.push("The diff summary command failed. The assessment pack is still usable; review Git status in `repo-summary.json` and rerun after building if needed.", "");
  }

  lines.push("```text", diffSummary.output.trim() || "No diff output.", "```", "");
  return lines.join("\n");
}

export function buildLatestMarkdown(title, files, globDescription) {
  const lines = ["# " + title, ""];
  if (!files.length) {
    lines.push(`No ${globDescription} files were found.`, "");
    return lines.join("\n");
  }

  for (const file of files) {
    lines.push(`## ${file.path}`, "", file.content.trim() || "(empty file)", "");
  }
  return lines.join("\n");
}

export function redactText(text, patterns = []) {
  let redactedText = text;
  const patternCounts = [];

  for (const pattern of patterns) {
    const regex = globalRegExp(pattern.regex);
    const matches = redactedText.match(regex);
    const count = matches?.length ?? 0;
    if (!count) continue;
    redactedText = redactedText.replace(globalRegExp(pattern.regex), pattern.replacement ?? "[REDACTED]");
    patternCounts.push({
      label: pattern.label,
      count
    });
  }

  return {
    text: redactedText,
    replacementCount: patternCounts.reduce((total, pattern) => total + pattern.count, 0),
    patterns: patternCounts
  };
}

export function truncateText(text, maxBytes = defaultMaxBytesPerArtifact) {
  const originalBytes = byteLength(text);
  if (!Number.isFinite(maxBytes) || originalBytes <= maxBytes) {
    return {
      text,
      truncated: false,
      originalBytes,
      writtenBytes: originalBytes
    };
  }

  const marker = `\n\n[TRUNCATED: original artifact exceeded ${maxBytes} bytes; original size ${originalBytes} bytes]\n`;
  const markerBytes = byteLength(marker);
  const contentBudget = Math.max(0, maxBytes - markerBytes);
  const truncatedContent = Buffer.from(text, "utf8").subarray(0, contentBudget).toString("utf8");
  const truncatedText = `${truncatedContent}${marker}`;
  return {
    text: truncatedText,
    truncated: true,
    originalBytes,
    writtenBytes: byteLength(truncatedText),
    maxBytes
  };
}

export async function writeRedactedTextArtifact({ filePath, artifact, text, safetyState }) {
  const originalBytes = byteLength(text);
  const redacted = redactText(text, safetyState.patterns);
  const truncated = truncateText(redacted.text, safetyState.maxBytesPerArtifact);
  await writeText(filePath, truncated.text);

  const writtenBytes = byteLength(truncated.text);
  safetyState.totalBytesWritten += writtenBytes;
  safetyState.artifacts.push({
    artifact,
    path: relative(safetyState.cwd, filePath),
    originalBytes,
    redactedBytes: byteLength(redacted.text),
    writtenBytes
  });

  if (redacted.replacementCount > 0) {
    safetyState.redactions.push({
      artifact,
      path: relative(safetyState.cwd, filePath),
      replacementCount: redacted.replacementCount,
      patterns: redacted.patterns
    });
  }

  if (truncated.truncated) {
    safetyState.truncatedArtifacts.push({
      artifact,
      path: relative(safetyState.cwd, filePath),
      originalBytes: truncated.originalBytes,
      maxBytes: truncated.maxBytes,
      writtenBytes: truncated.writtenBytes
    });
  }

  return {
    redacted,
    truncated,
    writtenBytes
  };
}

export function redactionSummary(redactions = []) {
  return {
    totalReplacementCount: redactions.reduce((total, artifact) => total + artifact.replacementCount, 0),
    artifacts: redactions
  };
}

export function buildMissionAuthoringSchema() {
  return `# Mission Authoring Schema

Mission files are Markdown files with simple YAML-like frontmatter followed by required body sections.

\`\`\`md
---
id: mission-slug
title: Human title
priority: P0/P1/P2/P3
risk: low/medium/high
category: product-value | safety | quality | developer-experience | automation-maintenance
affectedFiles:
  - path/from/repo/root
affectedNodes:
  - abstraction.node.id
dependsOn: []
parallelGroup: short-group-name
parallelGroupSafe: true/false
---

# Mission

## Goal

## Abstraction Tree Position

## Why This Matters

## Scope

## Out of Scope

## Required Checks

## Success Criteria
\`\`\`

Category meanings:

- product-value: improves capabilities or outcomes for project users/adopters.
- safety: reduces overreach, security, sandbox, data-loss, or operational risk.
- quality: improves correctness, validation, test coverage, drift detection, or reliability.
- developer-experience: improves docs, diagnostics, ergonomics, or maintainer workflow.
- automation-maintenance: maintains loop, runner, prompt, runtime, or process automation machinery without a clearer product, safety, quality, or developer-experience outcome.

Mission guidance:

- Keep each mission small enough for one bounded Codex execution.
- Include concrete affected files and abstraction node ids when known.
- Separate strategic rationale from implementation steps.
- Do not ask Codex to reassess the whole repository inside a mission.
- Put expected checks in each mission, including focused tests and repository-level checks when appropriate.
`;
}

function latestEvaluationArtifact(latestEvaluation) {
  if (!latestEvaluation.available) return latestEvaluation;
  return {
    available: true,
    source: latestEvaluation.path,
    evaluation: latestEvaluation.value
  };
}

async function prepareSafetyOptions(cwd, input = {}) {
  const options = normalizeSafetyOptions(input);
  const filePatterns = await readRedactFilePatterns(cwd, options.redactFiles);
  const customPatternInputs = [
    ...options.redactPatterns.map((pattern, index) => ({
      pattern,
      label: `custom-redact-${index + 1}`,
      source: "--redact"
    })),
    ...filePatterns
  ];
  const defaultPatterns = defaultRedactionPatternDefinitions.map(definition => ({
    label: definition.label,
    regex: definition.regex,
    replacement: definition.replacement,
    summary: {
      label: definition.label,
      source: "default",
      description: definition.description
    }
  }));
  const customPatterns = customPatternInputs.map(compileCustomRedactionPattern);

  return {
    ...options,
    patterns: [...defaultPatterns, ...customPatterns],
    redactionPatternsUsed: [
      ...defaultPatterns.map(pattern => pattern.summary),
      ...customPatterns.map(pattern => pattern.summary)
    ]
  };
}

function normalizeSafetyOptions(options = {}) {
  return {
    maxBytesPerArtifact: positiveIntegerOrDefault(options.maxBytesPerArtifact, defaultMaxBytesPerArtifact),
    maxTotalBytes: positiveIntegerOrDefault(options.maxTotalBytes, defaultMaxTotalBytes),
    redactPatterns: arrayValue(options.redactPatterns).map(value => String(value)).filter(Boolean),
    redactFiles: arrayValue(options.redactFiles).map(value => String(value)).filter(Boolean),
    includeDiff: options.includeDiff !== false,
    includeRuns: options.includeRuns !== false,
    includeLessons: options.includeLessons !== false,
    includeMissionRuntime: options.includeMissionRuntime !== false
  };
}

async function readRedactFilePatterns(cwd, redactFiles) {
  const patterns = [];
  for (let fileIndex = 0; fileIndex < redactFiles.length; fileIndex += 1) {
    const requestedPath = redactFiles[fileIndex];
    const filePath = path.resolve(cwd, requestedPath);
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      throw new Error(`Unable to read --redact-file ${requestedPath}: ${errorMessage(error)}`);
    }

    const lines = raw.split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const pattern = lines[lineIndex].trim();
      if (!pattern || pattern.startsWith("#")) continue;
      patterns.push({
        pattern,
        label: `custom-redact-file-${fileIndex + 1}-line-${lineIndex + 1}`,
        source: "--redact-file"
      });
    }
  }
  return patterns;
}

function compileCustomRedactionPattern(input) {
  try {
    return {
      label: input.label,
      regex: new RegExp(input.pattern, "g"),
      replacement: "[REDACTED]",
      summary: {
        label: input.label,
        source: input.source,
        description: "Custom redaction pattern; raw pattern hidden to avoid leaking sensitive values."
      }
    };
  } catch (error) {
    throw new Error(`Invalid redaction pattern ${input.label}: ${errorMessage(error)}`);
  }
}

function createSafetyState(cwd, packRelativeDir, options) {
  return {
    cwd,
    packRelativeDir,
    maxBytesPerArtifact: options.maxBytesPerArtifact,
    maxTotalBytes: options.maxTotalBytes,
    patterns: options.patterns,
    redactionPatternsUsed: options.redactionPatternsUsed,
    artifacts: [],
    redactions: [],
    truncatedArtifacts: [],
    omittedArtifacts: [],
    totalBytesWritten: 0
  };
}

function addConfiguredOmissions(safetyState, options) {
  if (!options.includeDiff) {
    safetyState.omittedArtifacts.push({
      artifact: "diff-summary.md",
      flag: "--no-diff",
      reason: "Diff summary omitted by --no-diff."
    });
  }
  if (!options.includeRuns) {
    safetyState.omittedArtifacts.push({
      artifact: "latest-runs.md",
      flag: "--no-runs",
      reason: "Latest run report content omitted by --no-runs."
    });
  }
  if (!options.includeLessons) {
    safetyState.omittedArtifacts.push({
      artifact: "latest-lessons.md",
      flag: "--no-lessons",
      reason: "Latest lesson content omitted by --no-lessons."
    });
  }
  if (!options.includeMissionRuntime) {
    safetyState.omittedArtifacts.push({
      artifact: "repo-summary.json",
      flag: "--no-mission-runtime",
      reason: "Mission runtime content omitted from repo-summary.json by --no-mission-runtime."
    });
  }
}

function buildPromptSafetySummary(safetyState, options) {
  const redactions = redactionSummary(safetyState.redactions);
  return {
    maxBytesPerArtifact: options.maxBytesPerArtifact,
    maxTotalBytes: options.maxTotalBytes,
    approximateBytesWrittenBeforePrompt: safetyState.totalBytesWritten,
    totalBudgetExceededBeforePrompt: safetyState.totalBytesWritten > options.maxTotalBytes,
    omittedArtifacts: safetyState.omittedArtifacts,
    truncatedArtifacts: safetyState.truncatedArtifacts,
    redactedArtifactCount: redactions.artifacts.length,
    redactionReplacementCount: redactions.totalReplacementCount
  };
}

function buildPackSafetyArtifact(safetyState, createdAt) {
  const redactions = redactionSummary(safetyState.redactions);
  const artifactBytesWritten = safetyState.totalBytesWritten;
  const packSafety = {
    createdAt: createdAt.toISOString(),
    pack: safetyState.packRelativeDir,
    redactionPatternsUsed: safetyState.redactionPatternsUsed,
    redaction: redactions,
    omittedArtifacts: safetyState.omittedArtifacts,
    truncatedArtifacts: safetyState.truncatedArtifacts,
    artifacts: safetyState.artifacts,
    limits: {
      maxBytesPerArtifact: safetyState.maxBytesPerArtifact,
      maxTotalBytes: safetyState.maxTotalBytes,
      approximateArtifactBytesWritten: artifactBytesWritten,
      packSafetyBytesWritten: 0,
      approximateTotalBytesWritten: artifactBytesWritten,
      totalBudgetExceeded: artifactBytesWritten > safetyState.maxTotalBytes
    },
    safetyAssessment: {
      safeToReview: artifactBytesWritten <= safetyState.maxTotalBytes,
      requiresManualInspection: true,
      reason: artifactBytesWritten > safetyState.maxTotalBytes
        ? "The pack exceeded the configured total byte warning limit. Inspect and reduce before sharing."
        : "Default redaction and byte limits were applied, but assessment packs can still include local context. Inspect before sharing."
    },
    noticeCount: 0
  };
  const packSafetyBytesWritten = byteLength(jsonText(packSafety));
  const approximateTotalBytesWritten = artifactBytesWritten + packSafetyBytesWritten;
  const totalBudgetExceeded = approximateTotalBytesWritten > safetyState.maxTotalBytes;
  packSafety.limits.packSafetyBytesWritten = packSafetyBytesWritten;
  packSafety.limits.approximateTotalBytesWritten = approximateTotalBytesWritten;
  packSafety.limits.totalBudgetExceeded = totalBudgetExceeded;
  packSafety.safetyAssessment.safeToReview = !totalBudgetExceeded;
  packSafety.safetyAssessment.reason = totalBudgetExceeded
    ? "The pack exceeded the configured total byte warning limit. Inspect and reduce before sharing."
    : "Default redaction and byte limits were applied, but assessment packs can still include local context. Inspect before sharing.";
  packSafety.noticeCount =
    redactions.artifacts.length +
    safetyState.truncatedArtifacts.length +
    safetyState.omittedArtifacts.length +
    (totalBudgetExceeded ? 1 : 0);
  return packSafety;
}

function buildAssessmentPromptSafetySection(safety) {
  const lines = [
    "## Pack Safety",
    "",
    "- Inspect `pack-safety.json` before pasting this pack into ChatGPT or sharing it externally."
  ];

  if (!safety) {
    lines.push("- Secret-like redaction and byte-limit controls may be applied by the pack generator.");
    return lines.join("\n");
  }

  lines.push(
    `- Per-artifact byte limit: ${safety.maxBytesPerArtifact}; total warning limit: ${safety.maxTotalBytes}.`,
    `- Approximate bytes written before this prompt: ${safety.approximateBytesWrittenBeforePrompt}.`
  );

  if (safety.omittedArtifacts.length) {
    lines.push(`- Omitted artifacts: ${safety.omittedArtifacts.map(artifact => artifact.artifact).join(", ")}.`);
  } else {
    lines.push("- Omitted artifacts: none recorded before this prompt was written.");
  }

  if (safety.truncatedArtifacts.length) {
    lines.push(`- Truncated artifacts: ${safety.truncatedArtifacts.map(artifact => artifact.artifact).join(", ")}.`);
  } else {
    lines.push("- Truncated artifacts: none recorded before this prompt was written.");
  }

  if (safety.redactionReplacementCount > 0) {
    lines.push(`- Redactions applied before this prompt: ${safety.redactionReplacementCount} replacement(s) across ${safety.redactedArtifactCount} artifact(s).`);
  } else {
    lines.push("- Redactions applied before this prompt: none recorded.");
  }

  if (safety.totalBudgetExceededBeforePrompt) {
    lines.push("- Total warning limit was already exceeded before this prompt was written.");
  }

  return lines.join("\n");
}

function buildOmittedMarkdown(title, reason) {
  return `# ${title}\n\n[OMITTED: ${reason}]\n`;
}

function omittedCommandArtifact(flag, reason) {
  return {
    exitCode: 0,
    output: "",
    source: `omitted by ${flag}`,
    omitted: true,
    reason
  };
}

function omittedJsonArtifact(relativePath, flag) {
  return {
    available: false,
    path: relativePath,
    omitted: true,
    reason: `Omitted by ${flag}.`
  };
}

async function diffSummaryCommand(cwd, runCommand = command) {
  const nodeResult = await runCommand("node", ["scripts/diff-summary.mjs"], { cwd, allowFailure: true });
  if (nodeResult.exitCode === 0 || process.platform !== "win32") {
    return {
      exitCode: nodeResult.exitCode,
      output: commandOutput(nodeResult),
      source: "node scripts/diff-summary.mjs"
    };
  }

  const powershellResult = await runCommand("powershell", [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/summarize-diff.ps1"
  ], { cwd, allowFailure: true });
  return {
    exitCode: powershellResult.exitCode,
    output: commandOutput(powershellResult),
    source: "powershell -ExecutionPolicy Bypass -File scripts/summarize-diff.ps1"
  };
}

async function changeReviewCommand(cwd, runCommand = command) {
  const source = "node packages/cli/dist/index.js changes review --project . --summary";
  const cliResult = await runCommand("node", ["packages/cli/dist/index.js", "changes", "review", "--project", ".", "--summary"], { cwd, allowFailure: true });
  if (cliResult.exitCode === 0) {
    return {
      exitCode: 0,
      output: commandOutput(cliResult),
      source
    };
  }

  const fallback = await buildChangeReviewFallback(cwd);
  if (fallback.available) {
    return {
      exitCode: 0,
      output: `${JSON.stringify(fallback.summary, null, 2)}\n`,
      source: `internal .abstraction-tree/changes summary fallback after ${source} failed: ${commandOutput(cliResult) || `exit ${cliResult.exitCode}`}`
    };
  }

  return {
    exitCode: cliResult.exitCode,
    output: commandOutput(cliResult),
    source
  };
}

async function buildChangeReviewFallback(cwd) {
  const relativeDirectory = ".abstraction-tree/changes";
  const entries = await readdir(path.join(cwd, relativeDirectory), { withFileTypes: true }).catch(() => []);
  if (!entries.length) {
    return {
      available: true,
      summary: {
        totalChangeRecordCount: 0,
        generatedScanRecordCount: 0,
        semanticChangeRecordCount: 0,
        eligibleGeneratedScanRecordCount: 0,
        retainedGeneratedScanRecordId: "",
        issueCount: 0
      }
    };
  }

  let issueCount = 0;
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const raw = await readText(path.join(cwd, relativeDirectory, entry.name));
    try {
      const value = JSON.parse(stripJsonBom(raw));
      if (!objectRecord(value)) {
        issueCount += 1;
        continue;
      }
      records.push({ name: entry.name, value });
    } catch {
      issueCount += 1;
    }
  }

  const generated = records
    .filter(record => stringValue(record.value.id).startsWith("scan."))
    .sort((left, right) => changeRecordSortKey(right).localeCompare(changeRecordSortKey(left)));
  const retained = generated[0]?.value;

  return {
    available: true,
    summary: {
      totalChangeRecordCount: records.length,
      generatedScanRecordCount: generated.length,
      semanticChangeRecordCount: records.length - generated.length,
      eligibleGeneratedScanRecordCount: Math.max(0, generated.length - 1),
      retainedGeneratedScanRecordId: stringValue(retained?.id),
      issueCount
    }
  };
}

async function readLatestJsonFile(cwd, relativeDirectory) {
  const entries = await readdir(path.join(cwd, relativeDirectory), { withFileTypes: true }).catch(() => []);
  const latest = entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => entry.name)
    .sort()
    .at(-1);

  if (!latest) {
    return {
      available: false,
      path: relativeDirectory,
      reason: "No JSON files found."
    };
  }

  return readJsonArtifact(cwd, `${relativeDirectory}/${latest}`);
}

async function readLatestMarkdownFiles(cwd, relativeDirectory, count) {
  const entries = await readdir(path.join(cwd, relativeDirectory), { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
    .map(entry => entry.name)
    .sort()
    .slice(-count)
    .reverse();

  return Promise.all(names.map(async name => {
    const relativePath = `${relativeDirectory}/${name}`;
    return {
      path: relativePath,
      content: await readText(path.join(cwd, relativePath))
    };
  }));
}

async function readJsonArtifact(cwd, relativePath) {
  const filePath = path.join(cwd, ...relativePath.split("/"));
  const fileStat = await stat(filePath).catch(error => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (!fileStat?.isFile()) {
    return {
      available: false,
      path: relativePath,
      reason: "File not found."
    };
  }

  const raw = await readText(filePath);
  try {
    return {
      available: true,
      path: relativePath,
      value: JSON.parse(stripJsonBom(raw))
    };
  } catch (error) {
    return {
      available: false,
      path: relativePath,
      reason: `Invalid JSON: ${errorMessage(error)}`,
      raw
    };
  }
}

async function command(file, args, options) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd,
      windowsHide: true,
      timeout: options.timeoutMs,
      maxBuffer: 50 * 1024 * 1024
    });
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const result = {
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message
    };
    if (options.allowFailure) return result;
    throw new Error(`${file} ${args.join(" ")} failed: ${result.stderr}`);
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function appendNodeLines(lines, nodes) {
  if (!nodes.length) {
    lines.push("- No nodes found.");
    return;
  }

  for (const node of nodes) {
    const id = stringValue(node.id) || "unknown";
    const title = stringValue(node.title) || stringValue(node.name) || id;
    const summary = stringValue(node.summary);
    lines.push(`- ${id}: ${title}${summary ? ` - ${summary}` : ""}`);
  }
}

function countBy(values, keyForValue) {
  const counts = new Map();
  for (const value of values) {
    const key = keyForValue(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function conceptScore(concept) {
  return arrayValue(concept.relatedFiles).length + arrayValue(concept.relatedNodeIds).length;
}

function commandOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function objectValue(value) {
  return objectRecord(value) ? value : {};
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function globalRegExp(regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function stripJsonBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function changeRecordSortKey(record) {
  return stringValue(record.value.timestamp) || stringValue(record.value.id) || record.name;
}

function timestampForPath(date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function relative(cwd, filePath) {
  return path.relative(cwd, filePath).replaceAll(path.sep, "/");
}

function valueAt(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer.`);
  }
  return parsed;
}

function positiveIntegerOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
