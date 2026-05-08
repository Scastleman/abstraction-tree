import type { Concept } from "@abstraction-tree/core";

export interface ConceptPanelProps {
  concepts: Concept[];
  limit?: number;
}

export function ConceptPanel({ concepts, limit = 12 }: ConceptPanelProps) {
  if (!concepts.length) return <p className="muted">No concepts are available yet.</p>;

  return (
    <>
      {concepts.slice(0, limit).map(concept => (
        <div className="card" key={concept.id}>
          <strong>{concept.title}</strong>
          <p>{concept.summary}</p>
          <small>{concept.relatedFiles.length} related files</small>
        </div>
      ))}
    </>
  );
}
