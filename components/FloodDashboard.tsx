'use client';

import { useEffect, useMemo, useState } from 'react';
import { Map, MapMarker, Polygon, Polyline, Rectangle, useKakaoLoader } from 'react-kakao-maps-sdk';
import type { CitizenReport, FloodPolygon, PumpStation, RiverGauge, RiskCell, RoadIncident, Shelter } from '@/lib/types';
import { ACTION_COPY } from '@/packages/risk/scoring';
import { haversineMeters, SEOUL_CENTER } from '@/lib/geo';
import { LevelBadge } from './LevelBadge';

type Props = {
  cells: RiskCell[];
  shelters: Shelter[];
  pumps: PumpStation[];
  gauges: RiverGauge[];
  reports: CitizenReport[];
  floodPolygons: FloodPolygon[];
  roadIncidents: RoadIncident[];
};

type RouteResult = {
  warning?: string | null;
  distanceMeters?: number;
  durationMinutes?: number;
  polyline?: Array<{ lat: number; lng: number }>;
  alternative?: { label: string; polyline: Array<{ lat: number; lng: number }> } | null;
};

type MapRenderProps = {
  cells: RiskCell[];
  shelters: Shelter[];
  pumps: PumpStation[];
  gauges: RiverGauge[];
  floodPolygons: FloodPolygon[];
  roadIncidents: RoadIncident[];
  layers: Record<string, boolean>;
  currentCell: RiskCell;
  nearestShelter?: { s: Shelter; d: number };
  route: RouteResult | null;
};

type PublicConfig = {
  kakaoJsKey: string;
  hasKakaoJsKey: boolean;
  deploymentOrigin: string | null;
};

const layerNames = ['위험 셀', '침수예상도', '대피소', '빗물펌프장', '도로 통제', '하천 수위계'] as const;
const levelColor = { SAFE: 'rgba(242,244,246,.35)', LOW: 'rgba(255,195,66,.55)', MEDIUM: 'rgba(254,152,0,.60)', HIGH: 'rgba(240,68,82,.68)' };
const levelStroke = { SAFE: '#e5e8eb', LOW: '#ffc342', MEDIUM: '#fe9800', HIGH: '#f04452' };
const buildTimeKakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '';

function KakaoRiskMap(props: MapRenderProps) {
  const [publicConfig, setPublicConfig] = useState<PublicConfig>(() => ({
    kakaoJsKey: buildTimeKakaoKey,
    hasKakaoJsKey: Boolean(buildTimeKakaoKey),
    deploymentOrigin: null,
  }));
  const [configStatus, setConfigStatus] = useState<'loading' | 'ready' | 'error'>(() => (buildTimeKakaoKey ? 'ready' : 'loading'));
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (buildTimeKakaoKey) return;
    let ignore = false;

    async function loadPublicConfig() {
      try {
        setConfigStatus('loading');
        const response = await fetch('/api/config/public', { cache: 'no-store' });
        if (!response.ok) throw new Error(`public config ${response.status}`);
        const data = (await response.json()) as PublicConfig;
        if (ignore) return;
        setPublicConfig({
          kakaoJsKey: data.kakaoJsKey ?? '',
          hasKakaoJsKey: Boolean(data.hasKakaoJsKey && data.kakaoJsKey),
          deploymentOrigin: data.deploymentOrigin ?? null,
        });
        setConfigStatus('ready');
      } catch (error) {
        if (ignore) return;
        setConfigError(error instanceof Error ? error.message : 'public config 로드 실패');
        setConfigStatus('error');
      }
    }

    void loadPublicConfig();
    return () => {
      ignore = true;
    };
  }, []);

  const kakaoKey = publicConfig.kakaoJsKey.trim();
  if (configStatus === 'loading') {
    return <FallbackRiskMap {...props} status="Kakao 지도 설정을 확인하는 중입니다." />;
  }
  if (!kakaoKey) {
    return <FallbackRiskMap {...props} status={configError ? `Kakao 지도 설정 로드 실패: ${configError}` : 'Kakao JavaScript 키가 배포 환경에 없어 CSS 지도를 표시합니다.'} />;
  }

  return <KakaoMapCanvas {...props} kakaoKey={kakaoKey} deploymentOrigin={publicConfig.deploymentOrigin} />;
}

function KakaoMapCanvas({ kakaoKey, deploymentOrigin, cells, shelters, pumps, gauges, floodPolygons, roadIncidents, layers, currentCell, nearestShelter, route }: MapRenderProps & { kakaoKey: string; deploymentOrigin: string | null }) {
  const [loading, error] = useKakaoLoader({ appkey: kakaoKey, libraries: ['services'] });

  if (loading) return <FallbackRiskMap cells={cells} layers={layers} currentCell={currentCell} nearestShelter={nearestShelter} pumps={pumps} gauges={gauges} status="Kakao 지도 SDK를 불러오는 중입니다." />;
  if (error) {
    const hostHint = deploymentOrigin ? ` 현재 도메인(${deploymentOrigin})이 Kakao Developers Web 플랫폼에 등록됐는지 확인하세요.` : ' Kakao Developers Web 플랫폼 도메인 등록을 확인하세요.';
    return <FallbackRiskMap cells={cells} layers={layers} currentCell={currentCell} nearestShelter={nearestShelter} pumps={pumps} gauges={gauges} status={`Kakao 지도 SDK 로드 실패.${hostHint}`} />;
  }

  return <div className="map" role="img" aria-label="Kakao Map 기반 서울 위험 셀 지도">
    <Map center={SEOUL_CENTER} level={9} style={{ width: '100%', height: '100%' }}>
      {layers['침수예상도'] && floodPolygons.map((poly) => <Polygon key={poly.id} path={poly.coordinates} fillColor="#3182f6" fillOpacity={0.12} strokeColor="#3182f6" strokeOpacity={0.36} strokeWeight={2} />)}
      {layers['위험 셀'] && cells.slice(0, 600).map((cell) => <Rectangle key={cell.cellId} bounds={{ sw: { lat: cell.bbox[1], lng: cell.bbox[0] }, ne: { lat: cell.bbox[3], lng: cell.bbox[2] } }} fillColor={levelStroke[cell.level]} fillOpacity={cell.level === 'SAFE' ? 0.08 : 0.42} strokeColor={levelStroke[cell.level]} strokeOpacity={0.7} strokeWeight={1} />)}
      {layers['대피소'] && shelters.map((s) => <MapMarker key={s.id} position={{ lat: s.lat, lng: s.lng }} title={s.name} />)}
      {layers['빗물펌프장'] && pumps.map((p) => <MapMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.name} />)}
      {layers['하천 수위계'] && gauges.map((g) => <MapMarker key={g.id} position={{ lat: g.lat, lng: g.lng }} title={`${g.name} ${Math.round(g.ratio * 100)}%`} />)}
      {layers['도로 통제'] && roadIncidents.map((r) => <MapMarker key={r.id} position={{ lat: r.lat, lng: r.lng }} title={r.title} />)}
      {route?.polyline && <Polyline path={route.polyline} strokeColor="#191f28" strokeOpacity={0.82} strokeWeight={4} />}
      {route?.alternative?.polyline && <Polyline path={route.alternative.polyline} strokeColor="#ffffff" strokeOpacity={0.95} strokeWeight={4} />}
    </Map>
    <MapOverlay currentCell={currentCell} nearestShelter={nearestShelter} pumps={pumps} gauges={gauges} layers={layers} status="Kakao Map 위에 위험 셀과 정적 레이어를 렌더링 중입니다." />
  </div>;
}

function FallbackRiskMap({ cells, layers, currentCell, nearestShelter, pumps, gauges, status }: Pick<Props, 'cells' | 'pumps' | 'gauges'> & { layers: Record<string, boolean>; currentCell: RiskCell; nearestShelter?: { s: Shelter; d: number }; status: string }) {
  return <div className="map" role="img" aria-label="서울 위험 셀 지도 fallback">
    {layers['위험 셀'] && <div className="demo-map-grid">{cells.slice(0, 125).map((cell) => <div key={cell.cellId} className="demo-cell" title={`${cell.gu} ${cell.score}`} style={{ background: levelColor[cell.level] }} />)}</div>}
    <MapOverlay currentCell={currentCell} nearestShelter={nearestShelter} pumps={pumps} gauges={gauges} layers={layers} status={status} />
  </div>;
}

function MapOverlay({ currentCell, nearestShelter, pumps, gauges, layers, status }: { currentCell: RiskCell; nearestShelter?: { s: Shelter; d: number }; pumps: PumpStation[]; gauges: RiverGauge[]; layers: Record<string, boolean>; status: string }) {
  return <div className="map-overlay stack">
    <div className="row"><b>{currentCell.gu} 현재 위험</b><LevelBadge level={currentCell.level} /></div>
    <p className="caption">점수 {currentCell.score.toFixed(3)} · 강수 60분 {currentCell.inputs.rain60m}mm · 하천비 {Math.round(currentCell.inputs.riverRatio * 100)}%</p>
    <div className="grid2">
      {layers['빗물펌프장'] && <div className="card"><b>{pumps[0]?.name}</b><p className="caption">배수 운영 감시 지점</p></div>}
      {layers['대피소'] && <div className="card"><b>{nearestShelter?.s.name}</b><p className="caption">{nearestShelter?.d.toLocaleString()}m · 도보 경로 보기</p></div>}
      {layers['하천 수위계'] && <div className="card"><b>{gauges[0]?.name}</b><p className="caption">위험 임계 대비 {Math.round((gauges[0]?.ratio ?? 0) * 100)}%</p></div>}
    </div>
    <p className="caption">{status}</p>
  </div>;
}

export function FloodDashboard({ cells, shelters, pumps, gauges, reports, floodPolygons, roadIncidents }: Props) {
  const [layers, setLayers] = useState<Record<string, boolean>>(() => Object.fromEntries(layerNames.map((n) => [n, true])));
  const [location, setLocation] = useState(SEOUL_CENTER);
  const [reportStatus, setReportStatus] = useState<string>();
  const [route, setRoute] = useState<RouteResult | null>(null);
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
    const payload = new FormData();
    payload.set('lat', String(location.lat));
    payload.set('lng', String(location.lng));
    payload.set('depthStep', String(formData.get('depthStep')));
    payload.set('mobilityBlock', mobilityBlock.join(','));
    if (formData.get('memo')) payload.set('memo', String(formData.get('memo')));
    const photo = formData.get('photo');
    if (photo instanceof File && photo.size > 0) payload.set('photo', photo);
    const response = await fetch('/api/reports', { method: 'POST', body: payload });
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
      <KakaoRiskMap cells={cells} shelters={shelters} pumps={pumps} gauges={gauges} floodPolygons={floodPolygons} roadIncidents={roadIncidents} layers={layers} currentCell={currentCell} nearestShelter={nearestShelter} route={route} />
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
        <input className="input" type="file" name="photo" accept="image/*" />
        <textarea className="textarea" name="memo" maxLength={180} placeholder="짧은 메모" />
        <button className="button" type="submit">현재 위치로 제보</button>
      </form>
      {reportStatus && <p className="caption">{reportStatus}</p>}
      <div className="stack">{reports.slice(0, 3).map((r) => <div className="row" key={r.id}><span>{r.gu} · {r.memo}</span><span className="caption">{r.depthStep}{r.photoUrl ? ' · 사진' : ''}</span></div>)}</div>
    </section>
  </>;
}
