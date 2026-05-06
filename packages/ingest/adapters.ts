import pRetry from 'p-retry';
import { env } from '@/lib/env';
import type { ApiHealth } from '@/lib/types';
import { minutesAgo } from '@/lib/time';

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ingestFetchTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 120)}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkPublicSources(): Promise<ApiHealth[]> {
  const checks: Array<{ provider: string; key?: string; url?: string; missing: string }> = [
    { provider: 'KMA 초단기실황', key: env.kmaKey, url: env.kmaKey ? `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(env.kmaKey)}&pageNo=1&numOfRows=10&dataType=JSON&base_date=20260506&base_time=1200&nx=60&ny=127` : undefined, missing: 'KMA_KEY 미설정' },
    { provider: 'KMA 초단기예보', key: env.kmaKey, url: env.kmaKey ? `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${encodeURIComponent(env.kmaKey)}&pageNo=1&numOfRows=10&dataType=JSON&base_date=20260506&base_time=1200&nx=60&ny=127` : undefined, missing: 'KMA_KEY 미설정' },
    { provider: '서울시 하천 수위', key: env.seoulKey, url: env.seoulKey ? `http://openapi.seoul.go.kr:8088/${env.seoulKey}/json/ListRiverStageService/1/5/` : undefined, missing: 'SEOUL_KEY 미설정' },
    { provider: '서울시 하수관로', key: env.seoulKey, url: env.seoulKey ? `http://openapi.seoul.go.kr:8088/${env.seoulKey}/json/DrainpipeMonitoringInfo/1/5/` : undefined, missing: 'SEOUL_KEY 미설정' },
    { provider: 'TOPIS 도로', key: env.topisKey, url: undefined, missing: 'TOPIS_KEY 미설정: R_road=0 fallback' },
  ];

  return Promise.all(checks.map(async (check) => {
    if (!check.key || !check.url) return { provider: check.provider, status: check.provider === 'TOPIS 도로' ? 'degraded' : 'error', failureCount1h: check.provider === 'TOPIS 도로' ? 0 : 1, message: check.missing } satisfies ApiHealth;
    try {
      await pRetry(() => fetchWithTimeout(check.url!), { retries: 1 });
      return { provider: check.provider, status: 'ok', lastSuccessAt: new Date().toISOString(), failureCount1h: 0, message: '외부 API 응답 확인' } satisfies ApiHealth;
    } catch (error) {
      return { provider: check.provider, status: 'degraded', lastSuccessAt: minutesAgo(12), failureCount1h: 1, message: `실패 후 데모 데이터 fallback: ${error instanceof Error ? error.message : String(error)}` } satisfies ApiHealth;
    }
  }));
}
