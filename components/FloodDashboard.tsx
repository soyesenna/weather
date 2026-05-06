'use client';

import { useMemo, useState } from 'react';
import type { CitizenReport, PumpStation, RiverGauge, RiskCell, Shelter } from '@/lib/types';
import { ACTION_COPY } from '@/packages/risk/scoring';
import { haversineMeters, SEOUL_CENTER } from '@/lib/geo';
import { LevelBadge } from './LevelBadge';

type Props = {
  cells: RiskCell[];
  shelters: Shelter[];
  pumps: PumpStation[];
  gauges: RiverGauge[];
  reports: CitizenReport[];
};

const layerNames = ['위험 셀', '침수예상도', '대피소', '빗물펌프장', '도로 통제', '하천 수위계'] as const;
const levelColor = { SAFE: 'rgba(242,244,246,.35)', LOW: 'rgba(255,195,66,.55)', MEDIUM: 'rgba(254,152,0,.60)', HIGH: 'rgba(240,68,82,.68)' };

export function FloodDashboard({ cells, shelters, pumps, gauges, reports }: Props) {
  const [layers, setLayers] = useState<Record<string, boolean>>(() => Object.fromEntries(layerNames.map((n) => [n, true])));
  const [location, setLocation] = useState(SEOUL_CENTER);
  const [reportStatus, setReportStatus] = useState<string>();
  const [route, setRoute] = useState<{ warning?: string | null; distanceMeters?: number; durationMinutes?: number } | null>(null);
  const currentCell = useMemo(() => cells.map((c) => ({ c, d: haversineMeters(location, c.center) })).sort((a, b) => a.d - b.d)[0]?.c ?? cells[0], [cells, location]);
  const nearestShelter = useMemo(() => shelters.map((s) => ({ s, d: haversineMeters(location, s) })).sort((a, b) => a.d - b.d)[0], [shelters, location]);
  const highCount = cells.filter((c) => c.level === 'HIGH').length;

  async function locate() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setReportStatus('위치 권한이 없어 서울시청 기준으로 표시합니다.'),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }

  async function submitReport(formData: FormData) {
    setReportStatus('제보 전송 중...');
    const mobilityBlock = ['보행', '유모차', '휠체어', '차량'].filter((v) => formData.get(v));
    const response = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      lat: location.lat, lng: location.lng, depthStep: formData.get('depthStep'), mobilityBlock, memo: formData.get('memo') || undefined,
    }) });
    const data = await response.json();
    setReportStatus(response.ok ? `제보가 접수됐습니다. (${data.report.gu})` : data.error ?? '제보 실패');
  }

  async function planRoute(formData: FormData) {
    const destination = formData.get('destination')?.toString() || '잠실역';
    const response = await fetch('/api/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      origin: location,
      destination: destination.includes('잠실') ? { lat: 37.5133, lng: 127.1001, label: destination } : { lat: 37.5404, lng: 127.0693, label: destination },
      profile: formData.get('profile') || 'walk',
    }) });
    setRoute(await response.json());
  }

  return <>
    <section className="featured stack" id="summary">
      <p className="eyebrow">서울 전역 실시간 위험 요약</p>
      <div className="row"><div><div className="metric">{highCount}</div><p style={{ margin: '6px 0 0' }}>HIGH 위험 셀</p></div><div><LevelBadge level={currentCell.level} /><p className="caption">내 주변 추정</p></div></div>
      <p>{ACTION_COPY[currentCell.level]}</p>
      <button className="button" onClick={locate}>내 위치 위험 확인</button>
    </section>

    <section className="stack" id="map">
      <div className="row"><h2>위험 지도</h2><span className="caption">줌 14 미만은 자치구 집계</span></div>
      <div className="switches">{layerNames.map((name) => <button key={name} className={`chip ${layers[name] ? 'active' : ''}`} onClick={() => setLayers((v) => ({ ...v, [name]: !v[name] }))}>{name}</button>)}</div>
      <div className="map" role="img" aria-label="서울 위험 셀 지도 데모">
        {layers['위험 셀'] && <div className="demo-map-grid">{cells.slice(0, 125).map((cell) => <div key={cell.cellId} className="demo-cell" title={`${cell.gu} ${cell.score}`} style={{ background: levelColor[cell.level] }} />)}</div>}
        <div className="map-overlay stack">
          <div className="row"><b>{currentCell.gu} 현재 위험</b><LevelBadge level={currentCell.level} /></div>
          <p className="caption">점수 {currentCell.score.toFixed(3)} · 강수 60분 {currentCell.inputs.rain60m}mm · 하천비 {Math.round(currentCell.inputs.riverRatio * 100)}%</p>
          <div className="grid2">
            {layers['빗물펌프장'] && <div className="card"><b>{pumps[0]?.name}</b><p className="caption">배수 운영 감시 지점</p></div>}
            {layers['대피소'] && <div className="card"><b>{nearestShelter?.s.name}</b><p className="caption">{nearestShelter?.d.toLocaleString()}m · 도보 경로 보기</p></div>}
            {layers['하천 수위계'] && <div className="card"><b>{gauges[0]?.name}</b><p className="caption">위험 임계 대비 {Math.round((gauges[0]?.ratio ?? 0) * 100)}%</p></div>}
          </div>
          <p className="caption">Kakao JS 키가 등록된 배포 환경에서는 Kakao Map 위에 동일 레이어를 올릴 수 있도록 API 응답을 분리했습니다.</p>
        </div>
      </div>
    </section>

    <section className="card stack" id="route">
      <h2>안전경로 확인</h2>
      <form action={planRoute} className="stack">
        <input className="input" name="origin" placeholder="출발지 (기본: 내 위치)" />
        <input className="input" name="destination" placeholder="도착지 예: 잠실역" />
        <select className="select" name="profile" defaultValue="walk"><option value="walk">도보</option><option value="car">차량</option></select>
        <button className="button" type="submit">경로 위험 검사</button>
      </form>
      {route && <div className="card" style={{ background: route.warning ? '#ffe8eb' : '#f2f4f6' }}><b>{route.warning ?? 'HIGH 셀 통과 없음'}</b><p className="caption">거리 {route.distanceMeters?.toLocaleString()}m · 예상 {route.durationMinutes}분 · fallback 직선/haversine 기준</p></div>}
    </section>

    <section className="card stack" id="report">
      <h2>익명 침수 제보</h2>
      <form action={submitReport} className="stack">
        <select className="select" name="depthStep" defaultValue="ankle"><option value="ankle">발목</option><option value="knee">무릎</option><option value="thigh">허벅지</option><option value="above">그 이상</option></select>
        <div className="grid2">{['보행', '유모차', '휠체어', '차량'].map((v) => <label key={v} className="caption"><input type="checkbox" name={v} /> {v} 통행불가</label>)}</div>
        <textarea className="textarea" name="memo" maxLength={180} placeholder="짧은 메모" />
        <button className="button" type="submit">현재 위치로 제보</button>
      </form>
      {reportStatus && <p className="caption">{reportStatus}</p>}
      <div className="stack">{reports.slice(0, 3).map((r) => <div className="row" key={r.id}><span>{r.gu} · {r.memo}</span><span className="caption">{r.depthStep}</span></div>)}</div>
    </section>
  </>;
}
