import type { RiskInputs, RiskLevel } from '@/lib/types';

export const RISK_WEIGHTS = {
  rain: 0.35,
  river: 0.20,
  drain: 0.20,
  floodOverlay: 0.20,
  road: 0.05,
} as const;

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function classifyRisk(score: number): RiskLevel {
  if (score >= 0.72) return 'HIGH';
  if (score >= 0.46) return 'MEDIUM';
  if (score >= 0.22) return 'LOW';
  return 'SAFE';
}

export function scoreRain(inputs: Pick<RiskInputs, 'rain10m' | 'rain30m' | 'rain60m'>) {
  const shortBurst = inputs.rain10m / 15;
  const halfHour = inputs.rain30m / 35;
  const hour = inputs.rain60m / 55;
  return clamp01(Math.max(shortBurst, halfHour, hour));
}

export function computeRiskScore(inputs: RiskInputs) {
  const rain = scoreRain(inputs);
  const river = clamp01(inputs.riverRatio);
  const drain = clamp01(inputs.drainSaturation * 0.7 + inputs.drainRise * 0.3);
  const flood = clamp01(inputs.floodOverlay);
  const road = clamp01(inputs.roadIncident);

  return clamp01(
    rain * RISK_WEIGHTS.rain +
    river * RISK_WEIGHTS.river +
    drain * RISK_WEIGHTS.drain +
    flood * RISK_WEIGHTS.floodOverlay +
    road * RISK_WEIGHTS.road,
  );
}

export const ACTION_COPY: Record<RiskLevel, string> = {
  SAFE: '현재 통행 가능성이 높습니다. 계속 기상 정보를 확인하세요.',
  LOW: '빗길 미끄럼과 배수구 주변 고임을 주의하세요.',
  MEDIUM: '저지대와 지하차도 접근을 줄이고 가까운 대피소를 확인하세요.',
  HIGH: '이 지역 통행을 자제하고 가까운 대피소 또는 높은 지대로 이동하세요.',
};

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  SAFE: '안전', LOW: '주의', MEDIUM: '경계', HIGH: '위험',
};
