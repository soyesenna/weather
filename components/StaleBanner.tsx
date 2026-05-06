import { formatKst } from '@/lib/time';

export function StaleBanner({ lastUpdatedAt }: { lastUpdatedAt?: string }) {
  const stale = !lastUpdatedAt || Date.now() - new Date(lastUpdatedAt).getTime() > 5 * 60_000;
  if (!stale) return null;
  return <div className="card" style={{ background: '#fff7d6', borderColor: '#ffe08a' }}><b>데이터 지연 주의</b><p style={{ margin: '4px 0 0' }}>마지막 갱신: {formatKst(lastUpdatedAt)} · 5분 이상 새 데이터가 없습니다.</p></div>;
}
