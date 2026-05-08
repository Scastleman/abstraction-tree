import type { Invariant } from "@abstraction-tree/core";

export interface InvariantPanelProps {
  invariants: Invariant[];
}

export function InvariantPanel({ invariants }: InvariantPanelProps) {
  if (!invariants.length) return <p className="muted">No invariants are available yet.</p>;

  return (
    <>
      {invariants.map(invariant => (
        <div className={`card ${invariant.severity}`} key={invariant.id}>
          <strong>{invariant.title}</strong>
          <p>{invariant.description}</p>
        </div>
      ))}
    </>
  );
}
