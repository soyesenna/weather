import Link from 'next/link';

export function BottomNav() {
  return <nav className="bottom-nav" aria-label="주요 화면"><Link href="/#map">지도</Link><Link href="/#route">경로</Link><Link href="/#report">제보</Link><Link href="/admin">관리</Link></nav>;
}
