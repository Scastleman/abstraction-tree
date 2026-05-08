import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  collectLlmProposalBundle,
  createLlmProposalRecord,
  ensureWorkspace,
  loadAtreeMemory,
  NoopLlmAbstractionBuilder,
  RuntimeSchemaValidationError,
  scanProject,
  validateLlmProposalBundle,
  writeLlmProposalRecord,
  type AbstractionBuilderInput,
  type LlmAbstractionBuilder,
  type LlmProposalRecord,
  type LlmProposalValidation
} from "@abstraction-tree/core";

export interface RunProposeCommandOptions {
  projectRoot: string;
  provider: string;
  adapter?: string;
  input?: string;
}

export interface RunProposeCommandResult {
  proposalPath: string;
  record: LlmProposalRecord;
  validation: LlmProposalValidation;
}

export async function runProposeCommand(options: RunProposeCommandOptions): Promise<RunProposeCommandResult> {
  await ensureWorkspace(options.projectRoot);
  const memory = await loadAtreeMemory(options.projectRoot);
  const memoryErrors = memory.issues.filter(issue => issue.severity === "error");
  if (memoryErrors.length) throw new RuntimeSchemaValidationError(memoryErrors);

  const scan = await scanProject(options.projectRoot);
  const { builder, adapterPath } = await loadLlmProviderAdapter(options);
  const input: AbstractionBuilderInput = {
    projectName: memory.config.projectName,
    scannerOutput: scan,
    existingOntology: memory.ontology,
    existingTree: memory.nodes,
    existingConcepts: memory.concepts,
    existingInvariants: memory.invariants,
    detectedChanges: []
  };
  const proposals = await collectLlmProposalBundle(builder, input);
  const validation = validateLlmProposalBundle(proposals, {
    existingOntology: memory.ontology,
    existingTree: memory.nodes,
    files: memory.files
  });
  const record = createLlmProposalRecord({
    provider: options.provider,
    adapter: adapterPath ? path.relative(options.projectRoot, adapterPath).replaceAll(path.sep, "/") : undefined,
    proposals,
    validation
  });
  const proposalPath = await writeLlmProposalRecord(options.projectRoot, record);

  return { proposalPath, record, validation };
}

interface LoadedLlmProviderAdapter {
  builder: LlmAbstractionBuilder;
  adapterPath?: string;
}

async function loadLlmProviderAdapter(options: RunProposeCommandOptions): Promise<LoadedLlmProviderAdapter> {
  if (options.provider === "noop" && !options.adapter) {
    return { builder: new NoopLlmAbstractionBuilder() };
  }

  const adapterPath = resolveAdapterPath(options);
  if (!adapterPath) {
    throw new Error(`No adapter module found for provider ${options.provider}. Pass --adapter <path> or add adapters/${options.provider}/index.mjs.`);
  }

  const module = await import(pathToFileURL(adapterPath).href) as Record<string, unknown>;
  const builder = await instantiateAdapter(module, {
    provider: options.provider,
    projectRoot: options.projectRoot,
    inputPath: options.input ? path.resolve(options.input) : undefined
  });
  if (!isLlmAbstractionBuilder(builder)) {
    throw new Error(`Adapter ${adapterPath} must export an LlmAbstractionBuilder, createAdapter(), or default factory.`);
  }

  return { builder, adapterPath };
}

function resolveAdapterPath(options: RunProposeCommandOptions): string | undefined {
  const candidates = [
    options.adapter ? path.resolve(options.adapter) : undefined,
    path.resolve(options.projectRoot, "adapters", options.provider, "index.mjs"),
    path.resolve(process.cwd(), "adapters", options.provider, "index.mjs")
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

async function instantiateAdapter(module: Record<string, unknown>, options: Record<string, unknown>): Promise<unknown> {
  const exported = module.createAdapter ?? module.default ?? module.builder;
  if (typeof exported === "function") return exported(options);
  return exported;
}

function isLlmAbstractionBuilder(value: unknown): value is LlmAbstractionBuilder {
  const record = objectRecord(value);
  return Boolean(
    record &&
    typeof record.proposeOntology === "function" &&
    typeof record.proposeTree === "function" &&
    typeof record.classifyChange === "function"
  );
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
