import type { ReactNode } from "react";

export interface PanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

export function Panel({ title, icon, children, wide = false }: PanelProps) {
  return (
    <section className={wide ? "panel wide" : "panel"}>
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
