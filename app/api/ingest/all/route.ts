import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { ingestDemoSnapshot } from '@/packages/risk/demo-data';
import { checkPublicSources } from '@/packages/ingest/adapters';
import { upsertHealth, upsertRiskCells } from '@/lib/repositories';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const token = request.headers.get('x-ingest-token') ?? new URL(request.url).searchParams.get('token');
  if (env.ingestToken && token !== env.ingestToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sourceHealth = await checkPublicSources();
  const snapshot = ingestDemoSnapshot();
  const health = sourceHealth.map((h, i) => h.status === 'ok' ? h : { ...h, lastSuccessAt: snapshot.sources[i]?.lastSuccessAt });
  await upsertHealth(health);
  const stored = await upsertRiskCells(snapshot.cells);
  return NextResponse.json({ ok: true, fetchedAt: snapshot.fetchedAt, health, cells: snapshot.cells.length, stored });
}
