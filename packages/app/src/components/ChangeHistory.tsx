import type { ChangeRecord } from "@abstraction-tree/core";

export interface ChangeHistoryProps {
  changes: ChangeRecord[];
}

export function ChangeHistory({ changes }: ChangeHistoryProps) {
  if (!changes.length) return <p className="muted">No change records are available yet.</p>;

  return (
    <>
      {changes.slice().reverse().map(change => (
        <div className="change" key={change.id}>
          <strong>{change.title}</strong>
          <span>{displayTimestamp(change.timestamp)} - risk {change.risk}</span>
          <p>{change.reason}</p>
        </div>
      ))}
    </>
  );
}

function displayTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}
