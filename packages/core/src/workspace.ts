import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AtreeConfig, InstallMode } from "./schema.js";

export const ATREE_DIR = ".abstraction-tree";

export function atreePath(projectRoot: string, ...parts: string[]) {
  return path.join(projectRoot, ATREE_DIR, ...parts);
}

export function defaultConfig(projectRoot: string, installMode: InstallMode = "core", projectName?: string): AtreeConfig {
  return {
    version: "0.1.0",
    projectName: projectName ?? path.basename(projectRoot),
    createdAt: new Date().toISOString(),
    sourceRoot: ".",
    ignored: ["node_modules", "dist", "dist-ts", "build", ".git", ".abstraction-tree", "coverage"],
    treeBuilder: "deterministic",
    installMode,
    visualApp: {
      enabled: installMode === "full",
      defaultPort: 4317
    }
  };
}

export async function ensureWorkspace(projectRoot: string, options?: { projectName?: string; installMode?: InstallMode }) {
  await mkdir(atreePath(projectRoot), { recursive: true });
  await mkdir(atreePath(projectRoot, "changes"), { recursive: true });
  await mkdir(atreePath(projectRoot, "context-packs"), { recursive: true });

  const configPath = atreePath(projectRoot, "config.json");
  if (!existsSync(configPath)) {
    await writeJson(configPath, defaultConfig(projectRoot, options?.installMode ?? "core", options?.projectName));
    return;
  }

  const existing = await readJson<AtreeConfig>(configPath, defaultConfig(projectRoot));
  const merged: AtreeConfig = {
    ...defaultConfig(projectRoot, options?.installMode ?? existing.installMode ?? "core", existing.projectName),
    ...existing,
    installMode: options?.installMode ?? existing.installMode ?? "core",
    visualApp: {
      enabled: options?.installMode ? options.installMode === "full" : existing.visualApp?.enabled ?? false,
      defaultPort: existing.visualApp?.defaultPort ?? 4317
    }
  };
  await writeJson(configPath, merged);
}

export async function setInstallMode(projectRoot: string, installMode: InstallMode) {
  await ensureWorkspace(projectRoot, { installMode });
  const config = await readConfig(projectRoot);
  await writeJson(atreePath(projectRoot, "config.json"), {
    ...config,
    installMode,
    visualApp: {
      ...config.visualApp,
      enabled: installMode === "full"
    }
  });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJson(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readConfig(projectRoot: string): Promise<AtreeConfig> {
  return readJson<AtreeConfig>(atreePath(projectRoot, "config.json"), defaultConfig(projectRoot));
}
