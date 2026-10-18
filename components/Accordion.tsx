import type { ReactNode } from "react";

/** A collapsed-by-default (unless `defaultOpen`) section built on the native disclosure element. */
export function Accordion({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="accordion" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {count !== undefined && <span className="accordion-count">{count}</span>}
      </summary>
      <div className="accordion-body">{children}</div>
    </details>
  );
}
