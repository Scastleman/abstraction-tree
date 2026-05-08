import { useEffect, useState } from "react";
import { Activity, AlertTriangle, FileText, GitBranch, History, Network, RefreshCw, Search } from "lucide-react";
import type { AbstractionTreeState as State } from "@abstraction-tree/core";
import { nodeFiles, nodeName } from "./nodeAccessors.js";
import { useAbstractionState, type AbstractionStateStatus } from "./hooks/useAbstractionState.js";
import { AgentHealthPanel } from "./components/AgentHealthPanel.js";
import { ChangeHistory } from "./components/ChangeHistory.js";
import { ConceptPanel } from "./components/ConceptPanel.js";
import { InvariantPanel } from "./components/InvariantPanel.js";
import { NodeDetails } from "./components/NodeDetails.js";
import { Panel } from "./components/Panel.js";
import { Stat } from "./components/Stat.js";
import { TreeList } from "./components/TreeList.js";

export function App() {
  const { state, status, error, isRefreshing, retry, refresh } = useAbstractionState();

  if (status === "loading" && !state) return <LoadingState />;
  if (status === "error" && !state) return <LoadError error={error} onRetry={retry} />;
  if (!state) return <LoadingState />;

  return (
    <AppExplorer
      error={error}
      isRefreshing={isRefreshing}
      onRefresh={refresh}
      onRetry={retry}
      state={state}
      status={status}
    />
  );
}

export interface AppExplorerProps {
  state: State;
  status: AbstractionStateStatus;
  error: string | null;
  isRefreshing: boolean;
  onRetry: () => void;
  onRefresh: () => void;
}

export function AppExplorer({
  state,
  status,
  error,
  isRefreshing,
  onRetry,
  onRefresh
}: AppExplorerProps) {
  const [selectedId, setSelectedId] = useState(() => preferredSelectedId(state) ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const hasSelectedNode = state.nodes.some(node => node.id === selectedId);
    if (!hasSelectedNode) setSelectedId(preferredSelectedId(state) ?? "");
  }, [selectedId, state]);

  const selected = state.nodes.find(node => node.id === selectedId) ?? state.nodes[0];
  const selectedFiles = nodeFiles(selected);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <GitBranch aria-hidden="true" />
          <div>
            <strong>Abstraction Tree</strong>
            <span>{state.config.projectName}</span>
          </div>
        </div>
        <label className="search">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Search tree nodes, files, and summaries"
            onChange={event => setQuery(event.target.value)}
            placeholder="Search node, file, concept..."
            value={query}
          />
        </label>
        <TreeList nodes={state.nodes} onSelect={setSelectedId} query={query} selectedId={selected?.id} />
      </aside>
      <main className="main">
        {status === "error" ? <InlineError error={error} onRetry={onRetry} /> : null}
        <section className="hero" aria-live="polite">
          <div>
            <p className="eyebrow">Project map</p>
            <h1>{selected ? nodeName(selected) : "No tree built yet"}</h1>
            <p>{selected?.summary ?? "Run `atree scan` to generate the initial abstraction tree."}</p>
          </div>
          <div className="hero-side">
            <button
              aria-label="Refresh /api/state"
              className="refresh-button"
              disabled={isRefreshing}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
            <div className="stats">
              <Stat label="Ontology" value={state.ontology?.length ?? 0} />
              <Stat label="Nodes" value={state.nodes.length} />
              <Stat label="Files" value={state.files.length} />
              <Stat label="Concepts" value={state.concepts.length} />
              <Stat label="Invariants" value={state.invariants.length} />
            </div>
          </div>
        </section>
        <section className="grid">
          <Panel icon={<Network aria-hidden="true" />} title="Selected node">
            <NodeDetails node={selected} />
          </Panel>
          <Panel icon={<Activity aria-hidden="true" />} title="Agent health">
            <AgentHealthPanel health={state.agentHealth} />
          </Panel>
          <Panel icon={<FileText aria-hidden="true" />} title="Owned files">
            {selectedFiles.length ? selectedFiles.map(filePath => (
              <code className="pill" key={filePath}>{filePath}</code>
            )) : <p className="muted">This node does not directly own files.</p>}
          </Panel>
          <Panel icon={<GitBranch aria-hidden="true" />} title="Concept map">
            <ConceptPanel concepts={state.concepts} />
          </Panel>
          <Panel icon={<AlertTriangle aria-hidden="true" />} title="Invariants & drift risks">
            <InvariantPanel invariants={state.invariants} />
          </Panel>
          <Panel icon={<History aria-hidden="true" />} title="Change history" wide>
            <ChangeHistory changes={state.changes} />
          </Panel>
        </section>
      </main>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="load-state" role="status">
      <GitBranch aria-hidden="true" />
      <h1>Loading Abstraction Tree</h1>
      <p>Requesting /api/state...</p>
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="load-state error-state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h1>Unable to load Abstraction Tree</h1>
      <p>{error ?? "The /api/state request failed."}</p>
      <button className="primary-action" onClick={onRetry} type="button">Retry</button>
    </div>
  );
}

function InlineError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>{error ?? "The /api/state refresh failed."}</span>
      <button onClick={onRetry} type="button">Retry</button>
    </div>
  );
}

function preferredSelectedId(state: State): string | undefined {
  return state.nodes.find(node => node.id === "project.intent")?.id ?? state.nodes[0]?.id;
}
