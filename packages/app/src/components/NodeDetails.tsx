import type { TreeNode } from "@abstraction-tree/core";
import { nodeDependencies, nodeLevel } from "../nodeAccessors.js";

export interface NodeDetailsProps {
  node?: TreeNode;
}

export function NodeDetails({ node }: NodeDetailsProps) {
  if (!node) return <p className="muted">No selected node.</p>;

  return (
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
  );
}
