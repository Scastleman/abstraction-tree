import type { ReactNode } from "react";

export interface WorkflowListItem {
  id: string;
  title: string;
  meta?: string;
  detail?: string;
  tone?: "good" | "warn" | "bad";
  selected?: boolean;
  action?: ReactNode;
}

export interface WorkflowListProps {
  items: WorkflowListItem[];
  emptyText: string;
}

export function WorkflowList({ items, emptyText }: WorkflowListProps) {
  if (!items.length) return <p className="muted">{emptyText}</p>;

  return (
    <div className="workflow-list">
      {items.map(item => (
        <div className={workflowListClass(item)} key={item.id}>
          <div>
            <strong>{item.title}</strong>
            {item.meta ? <span>{item.meta}</span> : null}
            {item.detail ? <p>{item.detail}</p> : null}
          </div>
          {item.action}
        </div>
      ))}
    </div>
  );
}

function workflowListClass(item: WorkflowListItem): string {
  return [
    "workflow-list-item",
    item.tone,
    item.selected ? "selected" : undefined
  ].filter(Boolean).join(" ");
}
