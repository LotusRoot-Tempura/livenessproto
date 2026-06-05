import type { CSSProperties, ReactNode } from "react";

export function Badge({
  children,
  tone = "info",
  progress,
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  progress?: number;
}) {
  const normalizedProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(1, progress))
      : undefined;
  const progressStage =
    normalizedProgress === undefined ? undefined : normalizedProgress < 0.34 ? "low" : normalizedProgress < 0.67 ? "mid" : "high";
  const style =
    normalizedProgress === undefined
      ? undefined
      : ({
          "--badge-progress-value": normalizedProgress.toFixed(3),
        } as CSSProperties);

  return (
    <span
      className="badge"
      data-tone={tone}
      data-has-progress={normalizedProgress === undefined ? "false" : "true"}
      data-progress-stage={progressStage}
      style={style}
    >
      {children}
    </span>
  );
}
