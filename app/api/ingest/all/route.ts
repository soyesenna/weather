import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { ingestDemoSnapshot } from '@/packages/risk/demo-data';
import { checkPublicSources } from '@/packages/ingest/adapters';
import { insertExternalSnapshots, upsertHealth, upsertRiskCells } from '@/lib/repositories';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const token = request.headers.get('x-ingest-token') ?? new URL(request.url).searchParams.get('token');
  if (env.ingestToken && token !== env.ingestToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sourceHealth = await checkPublicSources();
  const snapshot = ingestDemoSnapshot();
  const health = sourceHealth.map((h, i) => h.status === 'ok' ? h : { ...h, lastSuccessAt: snapshot.sources[i]?.lastSuccessAt });
  await upsertHealth(health);
  const snapshots = await insertExternalSnapshots(health.map((h) => ({
    provider: h.provider,
    endpoint: h.provider.includes('KMA') ? 'VilageFcstInfoService_2.0' : h.provider.includes('TOPIS') ? 'TOPIS' : h.provider.includes('하천') ? 'ListRiverStageService' : 'DrainpipeMonitoringInfo',
    fetchedAt: snapshot.fetchedAt,
    validAt: h.lastSuccessAt,
    payload: h,
  })));
  const stored = await upsertRiskCells(snapshot.cells);
  return NextResponse.json({ ok: true, fetchedAt: snapshot.fetchedAt, health, snapshots, cells: snapshot.cells.length, stored });
}
