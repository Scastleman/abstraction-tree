import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, GitBranch, FileText, AlertTriangle, Network, History, Search } from "lucide-react";
import type { AgentHealth, State, TreeNode } from "./types.js";
import "./styles.css";

function App() {
  const [state, setState] = useState<State | null>(null);
  const [selectedId, setSelectedId] = useState("project.intent");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/state").then(r => r.json()).then(setState).catch(() => setState(emptyState));
  }, []);

  const selected = state?.nodes.find(n => n.id === selectedId) ?? state?.nodes[0];
  const filtered = useMemo(() => {
    if (!state) return [];
    const q = query.toLowerCase();
    return state.nodes.filter(n => {
      const files = n.sourceFiles ?? n.ownedFiles ?? [];
      return !q || nodeName(n).toLowerCase().includes(q) || n.summary.toLowerCase().includes(q) || files.some(f => f.toLowerCase().includes(q));
    });
  }, [state, query]);

  if (!state) return <div className="loading">Loading Abstraction Tree...</div>;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><GitBranch /> <div><strong>Abstraction Tree</strong><span>{state.config.projectName}</span></div></div>
      <label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search node, file, concept..." /></label>
      <TreeList nodes={filtered} selectedId={selectedId} onSelect={setSelectedId} />
    </aside>
    <main className="main">
      <section className="hero">
        <div>
          <p className="eyebrow">Project map</p>
          <h1>{selected ? nodeName(selected) : "No tree built yet"}</h1>
          <p>{selected?.summary ?? "Run `atree scan` to generate the initial abstraction tree."}</p>
        </div>
        <div className="stats">
          <Stat label="Ontology" value={state.ontology?.length ?? 0} />
          <Stat label="Nodes" value={state.nodes.length} />
          <Stat label="Files" value={state.files.length} />
          <Stat label="Concepts" value={state.concepts.length} />
          <Stat label="Invariants" value={state.invariants.length} />
        </div>
      </section>
      <section className="grid">
        <Panel title="Selected node" icon={<Network />}>
          {selected ? <NodeDetails node={selected} /> : <p>No selected node.</p>}
        </Panel>
        <Panel title="Agent health" icon={<Activity />}>
          <AgentHealthPanel health={state.agentHealth} />
        </Panel>
        <Panel title="Owned files" icon={<FileText />}>
          {(nodeFiles(selected).length ? nodeFiles(selected) : []).map(f => <code className="pill" key={f}>{f}</code>)}
          {!nodeFiles(selected).length && <p className="muted">This node does not directly own files.</p>}
        </Panel>
        <Panel title="Concept map" icon={<GitBranch />}>
          {state.concepts.slice(0, 12).map(c => <div className="card" key={c.id}><strong>{c.title}</strong><p>{c.summary}</p><small>{c.relatedFiles.length} related files</small></div>)}
        </Panel>
        <Panel title="Invariants & drift risks" icon={<AlertTriangle />}>
          {state.invariants.map(i => <div className={`card ${i.severity}`} key={i.id}><strong>{i.title}</strong><p>{i.description}</p></div>)}
        </Panel>
        <Panel title="Change history" icon={<History />} wide>
          {state.changes.slice().reverse().map(c => <div className="change" key={c.id}><strong>{c.title}</strong><span>{new Date(c.timestamp).toLocaleString()} - risk {c.risk}</span><p>{c.reason}</p></div>)}
        </Panel>
      </section>
    </main>
  </div>;
}

function TreeList({ nodes, selectedId, onSelect }: { nodes: TreeNode[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="tree-list">{nodes.map(n => <button className={n.id === selectedId ? "active" : ""} key={n.id} onClick={() => onSelect(n.id)}><span>{nodeLevel(n)}</span>{nodeName(n)}</button>)}</div>;
}

function NodeDetails({ node }: { node: TreeNode }) {
  return <div className="details">
    <div><span>Level</span><strong>{nodeLevel(node)}</strong></div>
    <div><span>Confidence</span><strong>{Math.round(node.confidence * 100)}%</strong></div>
    <div><span>Children</span><strong>{node.children.length}</strong></div>
    <div><span>Dependencies</span><strong>{nodeDependencies(node).length}</strong></div>
  </div>;
}

function AgentHealthPanel({ health }: { health?: AgentHealth }) {
  if (!health) return <p className="muted">No agent health data is available.</p>;
  const runResult = health.latestRun?.result ?? "unknown";
  return <div className="health-grid">
    <HealthItem label="Latest run" value={runResult} detail={health.latestRun?.task ?? "No run report found."} tone={toneForRun(runResult)} />
    <HealthItem label="Latest evaluation" value={displayTimestamp(health.latestEvaluation?.timestamp)} detail={evaluationDetail(health.latestEvaluation)} />
    <HealthItem label="Validation issues" value={displayCount(health.validation?.issueCount)} detail={validationDetail(health.validation)} tone={health.validation?.issueCount ? "warn" : "good"} />
    <HealthItem label="Automation limits" value={automationLimit(health.automation)} detail={automationDetail(health.automation)} tone={health.automation?.stopRequested ? "warn" : undefined} />
  </div>;
}

function HealthItem({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "bad" }) {
  return <div className={tone ? `health-item ${tone}` : "health-item"}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>;
}

function Panel({ title, icon, children, wide=false }: { title: string; icon: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return <section className={wide ? "panel wide" : "panel"}><h2>{icon}{title}</h2>{children}</section>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div><strong>{value}</strong><span>{label}</span></div>; }

const emptyState: State = { config: { projectName: "Unknown" }, ontology: [], nodes: [], files: [], concepts: [], invariants: [], changes: [] };

function nodeName(node: TreeNode): string {
  return node.name ?? node.title;
}

function nodeLevel(node: TreeNode): string {
  return node.abstractionLevel ?? node.level;
}

function nodeFiles(node?: TreeNode): string[] {
  return node?.sourceFiles ?? node?.ownedFiles ?? [];
}

function nodeDependencies(node: TreeNode): string[] {
  return node.dependencies ?? node.dependsOn ?? [];
}

function displayTimestamp(value?: string): string {
  if (!value) return "Unknown";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

function displayCount(value?: number): string {
  return typeof value === "number" ? String(value) : "Unknown";
}

function evaluationDetail(evaluation?: AgentHealth["latestEvaluation"]): string {
  if (!evaluation) return "No evaluation report found.";
  const issues = typeof evaluation.issueCount === "number" ? `${evaluation.issueCount} eval issues` : "eval issues unknown";
  const stale = typeof evaluation.staleFileCount === "number" ? evaluation.staleFileCount : "?";
  const missing = typeof evaluation.missingFileCount === "number" ? evaluation.missingFileCount : "?";
  return `${issues}; drift stale ${stale}, missing ${missing}`;
}

function validationDetail(validation?: AgentHealth["validation"]): string {
  if (!validation) return "Validation status unavailable.";
  return `${validation.errorCount} errors, ${validation.warningCount} warnings`;
}

function automationLimit(automation?: AgentHealth["automation"]): string {
  if (!automation) return "Unknown";
  const loops = limitPair(automation.loopsToday, automation.maxLoopsToday);
  return loops ? `${loops} loops` : "Configured";
}

function automationDetail(automation?: AgentHealth["automation"]): string {
  if (!automation) return "Automation config not found.";
  const failed = limitPair(automation.failedLoopsToday, automation.maxFailedLoops);
  const pieces = [
    failed ? `${failed} failed` : undefined,
    typeof automation.maxDiffLines === "number" ? `${automation.maxDiffLines} max diff lines` : undefined,
    automation.stopRequested ? "stop requested" : undefined
  ].filter(Boolean);
  return pieces.join("; ") || "No runtime limits reported.";
}

function limitPair(current?: number, max?: number): string | undefined {
  if (typeof current === "number" && typeof max === "number") return `${current}/${max}`;
  if (typeof max === "number") return `max ${max}`;
  return undefined;
}

function toneForRun(result: string): "good" | "warn" | "bad" | undefined {
  if (result === "success") return "good";
  if (result === "failed") return "bad";
  if (result === "partial" || result === "unknown") return "warn";
  return undefined;
}

createRoot(document.getElementById("root")!).render(<App />);
