import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface CollapsibleSectionProps {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  meta,
  defaultOpen = false,
  children
}: CollapsibleSectionProps) {
  return (
    <details className="collapsible" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {meta ? <small>{meta}</small> : null}
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="collapsible-body">
        {children}
      </div>
    </details>
  );
}
