'use client';

import { useEffect, useState } from 'react';
import type { ApiHealth, CitizenReport, RiskCell } from '@/lib/types';
import { LevelBadge } from '@/components/LevelBadge';

type Summary = { topCells: RiskCell[]; reports: CitizenReport[]; health: ApiHealth[] };

export function AdminClient() {
  const [password, setPassword] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string>();

  async function load() {
    const res = await fetch('/api/admin/summary', { cache: 'no-store' });
    if (res.ok) setSummary(await res.json());
  }
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  async function login() {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!res.ok) { setError('비밀번호가 올바르지 않습니다.'); return; }
    setError(undefined); await load();
  }

  if (!summary) return <div className="container"><header className="app-header"><p className="eyebrow">운영자 콘솔</p><h1>비밀번호 인증</h1></header><main><section className="card stack"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ADMIN_PASSWORD" /><button className="button" onClick={login}>로그인</button>{error && <p className="caption" style={{ color: '#f04452' }}>{error}</p>}<p className="caption">환경변수 ADMIN_PASSWORD와 단순 비교합니다. 틀리면 401, 정상 로그인 후 5초마다 표가 갱신됩니다.</p></section></main></div>;

  return <div className="container"><header className="app-header"><p className="eyebrow">운영자 콘솔</p><h1>위험 셀과 제보 현황</h1></header><main>
    <section className="card stack"><h2>Top 20 위험 셀</h2><table className="table"><thead><tr><th>셀ID</th><th>구</th><th>점수</th><th>등급</th></tr></thead><tbody>{summary.topCells.map((c) => <tr key={c.cellId}><td>{c.cellId}</td><td>{c.gu}</td><td>{c.score.toFixed(3)}</td><td><LevelBadge level={c.level} /></td></tr>)}</tbody></table></section>
    <section className="card stack"><h2>최근 제보 50건</h2><table className="table"><thead><tr><th>시각</th><th>자치구</th><th>수위</th><th>사진</th></tr></thead><tbody>{summary.reports.map((r) => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleTimeString('ko-KR')}</td><td>{r.gu}</td><td>{r.depthStep}</td><td>{r.photoUrl ? '있음' : '-'}</td></tr>)}</tbody></table></section>
    <section className="card stack"><h2>데이터 수집 헬스</h2><table className="table"><thead><tr><th>API</th><th>상태</th><th>실패(1h)</th><th>메시지</th></tr></thead><tbody>{summary.health.map((h) => <tr key={h.provider}><td>{h.provider}</td><td>{h.status}</td><td>{h.failureCount1h}</td><td>{h.message}</td></tr>)}</tbody></table></section>
  </main></div>;
}
