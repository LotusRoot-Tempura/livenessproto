import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel">
      <h2>페이지를 찾을 수 없습니다.</h2>
      <p className="helper-text">메뉴로 돌아가 다시 이동해 주세요.</p>
      <Link href="/">홈으로 이동</Link>
    </div>
  );
}
