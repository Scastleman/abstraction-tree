import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GitBranch, FileText, AlertTriangle, Network, History, Search } from "lucide-react";
import type { State, TreeNode } from "./types.js";
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

createRoot(document.getElementById("root")!).render(<App />);
