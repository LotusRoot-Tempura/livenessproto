export function LoadingState({ text = "불러오는 중입니다." }: { text?: string }) {
  return <div className="loading-state">{text}</div>;
}
