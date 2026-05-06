import { GU_CENTERS } from '@/lib/geo';
import { isoNow, minutesAgo } from '@/lib/time';
import type { ApiHealth, CitizenReport, PumpStation, RiverGauge, RiskCell, RiskInputs, Shelter } from '@/lib/types';
import { classifyRisk, computeRiskScore } from './scoring';

function pseudo(seed: number) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

export function buildDemoInputs(index: number): RiskInputs {
  const wave = pseudo(index + Math.floor(Date.now() / 300_000));
  const hot = ['강남구', '송파구', '광진구', '영등포구', '강서구'].includes(GU_CENTERS[index % GU_CENTERS.length][0]) ? 0.28 : 0;
  return {
    rain10m: Math.round((wave * 18 + hot * 10) * 10) / 10,
    rain30m: Math.round((wave * 38 + hot * 22) * 10) / 10,
    rain60m: Math.round((wave * 62 + hot * 24) * 10) / 10,
    riverRatio: Math.min(1, wave * 0.82 + hot),
    drainSaturation: Math.min(1, wave * 0.9 + hot),
    drainRise: Math.min(1, pseudo(index + 33) * 0.9),
    floodOverlay: Math.min(1, pseudo(index + 51) > 0.64 ? 0.85 : pseudo(index + 2) * 0.35),
    roadIncident: pseudo(index + 77) > 0.82 ? 1 : 0,
  };
}

export function buildDemoRiskCells(): RiskCell[] {
  const cells: RiskCell[] = [];
  let n = 0;
  for (const [gu, lat, lng] of GU_CENTERS) {
    for (const [dx, dy] of [[0,0], [0.006,0.002], [-0.006,-0.002], [0.002,-0.006], [-0.002,0.006]]) {
      const inputs = buildDemoInputs(n);
      const score = computeRiskScore(inputs);
      const center = { lat: lat + dy, lng: lng + dx };
      cells.push({
        cellId: `demo-${String(n).padStart(4, '0')}`,
        gu,
        center,
        bbox: [center.lng - 0.0014, center.lat - 0.0011, center.lng + 0.0014, center.lat + 0.0011],
        score: Math.round(score * 1000) / 1000,
        level: classifyRisk(score),
        updatedAt: minutesAgo(n % 8),
        inputs,
      });
      n++;
    }
  }
  return cells;
}

export const demoShelters: Shelter[] = GU_CENTERS.slice(0, 25).map(([gu, lat, lng], i) => ({
  id: `shelter-${i + 1}`,
  name: `${gu} 임시대피소`,
  gu,
  lat: lat + 0.004,
  lng: lng - 0.004,
  capacity: 120 + i * 8,
}));

export const demoPumps: PumpStation[] = GU_CENTERS.filter((_, i) => i % 2 === 0).map(([gu, lat, lng], i) => ({
  id: `pump-${i + 1}`,
  name: `${gu} 빗물펌프장`,
  gu,
  lat: lat - 0.005,
  lng: lng + 0.003,
}));

export const demoGauges: RiverGauge[] = GU_CENTERS.filter((_, i) => i % 3 === 0).map(([gu, lat, lng], i) => ({
  id: `gauge-${i + 1}`,
  name: `${gu} 수위계`,
  gu,
  lat: lat - 0.003,
  lng: lng - 0.005,
  ratio: Math.round((0.25 + pseudo(i) * 0.72) * 100) / 100,
}));

export const demoReports: CitizenReport[] = [
  { id: 'report-1', gu: '강남구', lat: 37.514, lng: 127.048, depthStep: 'knee', mobilityBlock: ['보행', '차량'], memo: '교차로 배수가 느립니다.', createdAt: minutesAgo(7) },
  { id: 'report-2', gu: '영등포구', lat: 37.525, lng: 126.898, depthStep: 'ankle', mobilityBlock: ['유모차', '휠체어'], memo: '보도 쪽 물고임', createdAt: minutesAgo(19) },
  { id: 'report-3', gu: '송파구', lat: 37.513, lng: 127.103, depthStep: 'thigh', mobilityBlock: ['차량'], memo: '지하차도 입구 통제 필요', createdAt: minutesAgo(31) },
];

export function demoHealth(): ApiHealth[] {
  return [
    { provider: 'KMA 초단기실황', status: 'ok', lastSuccessAt: minutesAgo(3), failureCount1h: 0, message: 'getUltraSrtNcst 수집 정상' },
    { provider: 'KMA 초단기예보', status: 'ok', lastSuccessAt: minutesAgo(38), failureCount1h: 0, message: 'getUltraSrtFcst 최근 1시간 이내 정상' },
    { provider: '서울시 하천 수위', status: 'ok', lastSuccessAt: minutesAgo(8), failureCount1h: 0, message: 'ListRiverStageService 정상' },
    { provider: '서울시 하수관로', status: 'ok', lastSuccessAt: minutesAgo(9), failureCount1h: 0, message: 'DrainpipeMonitoringInfo 정상' },
    { provider: 'TOPIS 도로', status: 'degraded', lastSuccessAt: undefined, failureCount1h: 0, message: '키 미설정 시 R_road=0 fallback' },
  ];
}

export function ingestDemoSnapshot() {
  return {
    fetchedAt: isoNow(),
    sources: demoHealth(),
    cells: buildDemoRiskCells(),
  };
}
