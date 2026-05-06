import { NextResponse } from 'next/server';
import { dbAvailable } from '@/lib/db';
import { getHealth } from '@/lib/repositories';

export async function GET() {
  return NextResponse.json({ ok: true, db: await dbAvailable(), health: await getHealth() });
}
