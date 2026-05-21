export function StatusCard({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <article className="status-card" data-tone={tone}>
      <div className="status-card__title">{title}</div>
      <div className="status-card__body">{description}</div>
    </article>
  );
}
