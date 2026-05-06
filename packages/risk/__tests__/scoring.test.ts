import { describe, expect, it } from 'vitest';
import { classifyRisk, computeRiskScore, scoreRain } from '../scoring';

const base = { rain10m: 0, rain30m: 0, rain60m: 0, riverRatio: 0, drainSaturation: 0, drainRise: 0, floodOverlay: 0, roadIncident: 0 };

describe('risk scoring', () => {
  it('classifies safe cells below low threshold', () => {
    expect(classifyRisk(computeRiskScore(base))).toBe('SAFE');
  });

  it('detects high rainfall burst as high risk when combined with drainage and flood overlay', () => {
    const score = computeRiskScore({ ...base, rain10m: 18, rain30m: 42, riverRatio: 0.85, drainSaturation: 0.92, drainRise: 0.8, floodOverlay: 1, roadIncident: 1 });
    expect(score).toBeGreaterThanOrEqual(0.72);
    expect(classifyRisk(score)).toBe('HIGH');
  });

  it('uses the worst 10/30/60 minute rainfall window', () => {
    expect(scoreRain({ rain10m: 2, rain30m: 12, rain60m: 55 })).toBe(1);
  });

  it('keeps TOPIS fallback influence small', () => {
    const withoutRoad = computeRiskScore({ ...base, rain30m: 25, drainSaturation: 0.5, floodOverlay: 0.5, roadIncident: 0 });
    const withRoad = computeRiskScore({ ...base, rain30m: 25, drainSaturation: 0.5, floodOverlay: 0.5, roadIncident: 1 });
    expect(withRoad - withoutRoad).toBeLessThanOrEqual(0.051);
  });
});
