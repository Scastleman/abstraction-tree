import type { TreeNode } from "@abstraction-tree/core";
import { nodeDependencies, nodeFiles, nodeLevel } from "../nodeAccessors.js";

export interface NodeDetailsProps {
  node?: TreeNode;
}

export function NodeDetails({ node }: NodeDetailsProps) {
  if (!node) return <p className="muted">No selected node.</p>;

  return (
    <div className="node-details">
      <section className="node-summary" aria-label="What this node represents">
        <span>Summary</span>
        <p>{node.summary}</p>
      </section>
      {node.explanation?.trim() && node.explanation.trim() !== node.summary.trim() ? (
        <section className="node-explanation" aria-label="Human-readable node explanation">
          <span>Explanation</span>
          <p>{node.explanation}</p>
        </section>
      ) : null}
      {node.separationLogic?.trim() ? (
        <section className="node-explanation" aria-label="Child node separation logic">
          <span>Separation Logic</span>
          <p>{node.separationLogic}</p>
        </section>
      ) : null}
      {node.responsibilities.length ? (
        <section className="node-evidence" aria-label="Node responsibilities">
          <span>Responsibilities</span>
          <ul>
            {node.responsibilities.slice(0, 3).map(responsibility => (
              <li key={responsibility}>{responsibility}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="node-evidence" aria-label="Node ownership and relationships">
        <span>Scope Evidence</span>
        <CompactList label="Owned files" values={nodeFiles(node)} />
        <CompactList label="Children" values={node.children} />
        <CompactList label="Dependencies" values={nodeDependencies(node)} />
        <CompactList label="Invariants" values={node.invariants} />
      </section>
      <div className="details">
        <div>
          <span>Level</span>
          <strong>{nodeLevel(node)}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{Math.round(node.confidence * 100)}%</strong>
        </div>
        <div>
          <span>Children</span>
          <strong>{node.children.length}</strong>
        </div>
        <div>
          <span>Dependencies</span>
          <strong>{nodeDependencies(node).length}</strong>
        </div>
      </div>
    </div>
  );
}

function CompactList({ label, values }: { label: string; values: string[] }) {
  const shown = values.slice(0, 5);
  const remainder = values.length - shown.length;

  return (
    <div className="node-evidence-row">
      <strong>{label}</strong>
      {shown.length ? (
        <span>{shown.join(", ")}{remainder > 0 ? `, +${remainder} more` : ""}</span>
      ) : <span>None</span>}
    </div>
  );
}
