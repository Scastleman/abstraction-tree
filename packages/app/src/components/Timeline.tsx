import type { ReactNode } from "react";

export type TimelineTone = "complete" | "pending" | "warning" | "blocked";

export interface TimelineItem {
  id: string;
  title: string;
  status: TimelineTone;
  summary: string;
  children?: ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
}

export function Timeline({ items }: TimelineProps) {
  if (!items.length) return <p className="muted">No timeline stages are available.</p>;

  return (
    <ol className="timeline">
      {items.map(item => (
        <li className={`timeline-item ${item.status}`} key={item.id}>
          <div className="timeline-marker" aria-hidden="true" />
          <div className="timeline-content">
            <div className="timeline-heading">
              <strong>{item.title}</strong>
              <span>{item.status}</span>
            </div>
            <p>{item.summary}</p>
            {item.children}
          </div>
        </li>
      ))}
    </ol>
  );
}
