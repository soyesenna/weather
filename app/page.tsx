export const dynamic = 'force-dynamic';
import { BottomNav } from '@/components/BottomNav';
import { FloodDashboard } from '@/components/FloodDashboard';
import { StaleBanner } from '@/components/StaleBanner';
import { demoFloodPolygons, demoGauges, demoPumps, demoRoadIncidents, demoShelters } from '@/packages/risk/demo-data';
import { getHealth, getReports, getRiskCells } from '@/lib/repositories';
import { formatKst } from '@/lib/time';

export default async function Home() {
  const [cells, reports, health] = await Promise.all([getRiskCells({ limit: 200 }), getReports(50), getHealth()]);
  const lastUpdatedAt = cells.map((c) => c.updatedAt).sort().at(-1);
  return <div className="container">
    <header className="app-header"><p className="eyebrow">AI 기반 도시침수 대응 데모</p><h1>서울 침수 위험을<br />한눈에 확인하세요</h1><p className="caption">마지막 수집 {formatKst(lastUpdatedAt)} · 공공 API {health.filter((h) => h.status === 'ok').length}/{health.length} 정상</p></header>
    <main>
      <StaleBanner lastUpdatedAt={lastUpdatedAt} />
      <FloodDashboard cells={cells} shelters={demoShelters} pumps={demoPumps} gauges={demoGauges} reports={reports} floodPolygons={demoFloodPolygons} roadIncidents={demoRoadIncidents} />
      <section className="card stack"><h2>데모 범위</h2><p>ML 학습·SMS/푸시 발송 없이, KMA·서울시·TOPIS 수집 결과와 룰베이스 가중합으로 4단계 위험도를 계산합니다.</p></section>
    </main>
    <BottomNav />
  </div>;
}
