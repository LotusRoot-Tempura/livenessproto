import { ReactNode } from "react";

export function Badge({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  );
}
