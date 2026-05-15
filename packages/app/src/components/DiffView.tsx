export interface DiffViewItem {
  id: string;
  label: string;
  meta?: string;
  detail: string;
  status: "selected" | "excluded" | "questionable";
  impact?: "low" | "medium" | "high";
}

export interface DiffViewProps {
  items: DiffViewItem[];
  emptyText: string;
}

export function DiffView({ items, emptyText }: DiffViewProps) {
  if (!items.length) return <p className="muted">{emptyText}</p>;

  return (
    <div className="diff-view">
      {items.map(item => (
        <div className={`diff-row ${item.status} ${item.impact ?? "medium"}`} key={`${item.status}-${item.id}`}>
          <div className="diff-sign" aria-hidden="true">{signForStatus(item.status)}</div>
          <div>
            <strong>{item.label}</strong>
            {item.meta ? <span>{item.meta}</span> : null}
            <p>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function signForStatus(status: DiffViewItem["status"]): string {
  if (status === "selected") return "+";
  if (status === "excluded") return "-";
  return "?";
}
