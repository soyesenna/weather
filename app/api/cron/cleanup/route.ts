import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() { return cleanup(); }
export async function POST() { return cleanup(); }

async function cleanup() {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: true, fallback: true, deleted: 0 });
  const reports = await sql`delete from external_snapshots where fetched_at < now() - interval '72 hours'`;
  return NextResponse.json({ ok: true, deleted: reports.count ?? 0 });
}
