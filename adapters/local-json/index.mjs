import { readFile } from "node:fs/promises";
import path from "node:path";

export function createAdapter(options = {}) {
  return new LocalJsonLlmAbstractionBuilder(options);
}

export default createAdapter;

export class LocalJsonLlmAbstractionBuilder {
  constructor(options = {}) {
    this.inputPath = resolveInputPath(options.inputPath);
    this.loaded = undefined;
  }

  async proposeOntology() {
    const proposal = await this.proposal();
    return proposal.ontology ?? noOpOntologyProposal();
  }

  async proposeTree() {
    const proposal = await this.proposal();
    return proposal.tree ?? noOpTreeProposal();
  }

  async classifyChange(input) {
    const proposal = await this.proposal();
    return proposal.classification ?? noOpChangeClassification(input);
  }

  async proposal() {
    if (!this.loaded) this.loaded = readProposal(this.inputPath);
    return this.loaded;
  }
}

function resolveInputPath(inputPath) {
  const configured = inputPath ?? process.env.ATREE_LOCAL_JSON_PROPOSAL;
  if (!configured) {
    throw new Error("local-json adapter requires --input <proposal.json> or ATREE_LOCAL_JSON_PROPOSAL.");
  }
  return path.resolve(configured);
}

async function readProposal(inputPath) {
  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(stripJsonBom(raw));
}

function stripJsonBom(raw) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function noOpOntologyProposal() {
  return {
    ...metadata("No ontology proposal was present in the local JSON adapter input."),
    proposedOntologyChanges: []
  };
}

function noOpTreeProposal() {
  return {
    ...metadata("No tree proposal was present in the local JSON adapter input."),
    proposedTreeChanges: []
  };
}

function noOpChangeClassification(input) {
  return {
    ...metadata("No change classification was present in the local JSON adapter input."),
    changes: (input.detectedChanges ?? []).map(change => ({
      ...metadata("The local JSON adapter did not classify this change."),
      change,
      classification: "needs-human-review"
    }))
  };
}

function metadata(rationale) {
  return {
    confidence: 0,
    rationale,
    warnings: ["local-json adapter returned deterministic no-op output for the missing section."],
    affectedLayers: []
  };
}
