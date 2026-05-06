import { NextResponse } from 'next/server';
import { getAggregatedRisk } from '@/lib/repositories';

export async function GET() {
  return NextResponse.json({ gus: await getAggregatedRisk() });
}
