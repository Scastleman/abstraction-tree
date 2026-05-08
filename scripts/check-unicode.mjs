#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listProjectFiles, maxTextBytes, supportsTextProcessing } from "./project-text-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const bidiControls = new Map([
  [0x202a, "LEFT-TO-RIGHT EMBEDDING"],
  [0x202b, "RIGHT-TO-LEFT EMBEDDING"],
  [0x202c, "POP DIRECTIONAL FORMATTING"],
  [0x202d, "LEFT-TO-RIGHT OVERRIDE"],
  [0x202e, "RIGHT-TO-LEFT OVERRIDE"],
  [0x2066, "LEFT-TO-RIGHT ISOLATE"],
  [0x2067, "RIGHT-TO-LEFT ISOLATE"],
  [0x2068, "FIRST STRONG ISOLATE"],
  [0x2069, "POP DIRECTIONAL ISOLATE"]
]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const findings = await scanProject();

  if (!findings.length) {
    console.log("No suspicious Unicode control characters found.");
  } else {
    console.error("Suspicious Unicode control characters found:");
    for (const finding of findings) {
      console.error(`${finding.filePath}:${finding.line}:${finding.column} ${finding.codePoint} ${finding.name}`);
      console.error(`  ${finding.excerpt}`);
    }
    process.exit(1);
  }
}

export async function scanProject(root = repoRoot) {
  const findings = [];
  const files = await listProjectFiles(root);

  for (const filePath of files) {
    if (!supportsTextProcessing(filePath)) continue;

    const absolutePath = path.join(root, filePath);
    const fileStat = await stat(absolutePath).catch(() => undefined);
    if (!fileStat?.isFile() || fileStat.size > maxTextBytes) continue;

    const buffer = await readFile(absolutePath).catch(() => undefined);
    if (!buffer || buffer.includes(0)) continue;

    findings.push(...findSuspiciousUnicode(filePath, buffer.toString("utf8")));
  }

  return findings;
}

export function findSuspiciousUnicode(filePath, text) {
  const findings = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((lineText, lineIndex) => {
    for (let index = 0; index < lineText.length; index += 1) {
      const codePoint = lineText.codePointAt(index);
      if (codePoint === undefined) continue;
      if (codePoint > 0xffff) index += 1;
      const name = bidiControls.get(codePoint);
      if (!name) continue;

      findings.push({
        filePath,
        line: lineIndex + 1,
        column: index + 1,
        codePoint: formatCodePoint(codePoint),
        name,
        excerpt: sanitizeLine(lineText)
      });
    }
  });

  return findings;
}

export function sanitizeLine(lineText) {
  let output = "";
  for (let index = 0; index < lineText.length; index += 1) {
    const codePoint = lineText.codePointAt(index);
    if (codePoint === undefined) continue;
    if (codePoint > 0xffff) index += 1;
    output += bidiControls.has(codePoint) ? `<${formatCodePoint(codePoint)}>` : String.fromCodePoint(codePoint);
  }
  return output;
}

function formatCodePoint(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}
