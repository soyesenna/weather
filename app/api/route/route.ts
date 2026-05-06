import { NextResponse } from 'next/server';
import { z } from 'zod';
import { haversineMeters } from '@/lib/geo';
import { getRiskCells } from '@/lib/repositories';

const schema = z.object({
  origin: z.object({ lat: z.number(), lng: z.number(), label: z.string().optional() }),
  destination: z.object({ lat: z.number(), lng: z.number(), label: z.string().optional() }),
  profile: z.enum(['walk', 'car']).default('walk'),
});

function pointNearSegment(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const ax = a.lng, ay = a.lat, bx = b.lng, by = b.lat, px = p.lng, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const nearest = { lat: ay + t * dy, lng: ax + t * dx };
  return haversineMeters(p, nearest);
}

export async function POST(request: Request) {
  const input = schema.parse(await request.json());
  const distance = haversineMeters(input.origin, input.destination);
  const cells = await getRiskCells({ limit: 1000 });
  const crossedHigh = cells.filter((c) => c.level === 'HIGH' && pointNearSegment(c.center, input.origin, input.destination) < 450);
  return NextResponse.json({
    profile: input.profile,
    fallback: true,
    distanceMeters: distance,
    durationMinutes: Math.max(1, Math.round(distance / (input.profile === 'walk' ? 75 : 420))),
    polyline: [input.origin, input.destination],
    warning: crossedHigh.length > 0 ? `경로가 HIGH 위험 셀 ${crossedHigh.length}개 인근을 통과합니다.` : null,
    crossedHigh: crossedHigh.slice(0, 5),
    alternative: crossedHigh.length > 0 ? {
      label: '우회 후보(직선 보정)',
      polyline: [input.origin, { lat: (input.origin.lat + input.destination.lat) / 2 + 0.012, lng: (input.origin.lng + input.destination.lng) / 2 - 0.012 }, input.destination],
    } : null,
  });
}
