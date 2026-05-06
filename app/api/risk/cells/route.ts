import { NextResponse } from 'next/server';
import { getAggregatedRisk, getRiskCells } from '@/lib/repositories';

export const runtime = 'nodejs';

function bboxAreaKm2(bbox: [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const kmLat = (maxLat - minLat) * 111;
  const kmLng = (maxLng - minLng) * 88;
  return Math.abs(kmLat * kmLng);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('bbox');
  const bbox = raw?.split(',').map(Number) as [number, number, number, number] | undefined;
  const zoom = Number(searchParams.get('zoom') ?? 14);
  const wantsAggregated = bbox && (bboxAreaKm2(bbox) > 50 || zoom < 14);
  if (wantsAggregated) {
    const gus = await getAggregatedRisk();
    return NextResponse.json({ auto_aggregated: true, gus }, { headers: { 'X-Auto-Aggregated': 'true' } });
  }
  const cells = await getRiskCells({ bbox, limit: 1500 });
  if (cells.length >= 1500) {
    const gus = await getAggregatedRisk();
    return NextResponse.json({ auto_aggregated: true, gus }, { headers: { 'X-Auto-Aggregated': 'true' } });
  }
  return NextResponse.json({ auto_aggregated: false, cells });
}
