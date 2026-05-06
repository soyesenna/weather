import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createReport, getReports, hashIp, withinReportRateLimit } from '@/lib/repositories';
import { env } from '@/lib/env';

const schema = z.object({
  lat: z.number().min(37).max(38),
  lng: z.number().min(126).max(128),
  depthStep: z.enum(['ankle', 'knee', 'thigh', 'above']),
  mobilityBlock: z.array(z.string()).default([]),
  memo: z.string().max(180).optional(),
  photoUrl: z.string().url().optional(),
});

export async function GET() {
  return NextResponse.json({ reports: await getReports(50) });
}

export async function POST(request: Request) {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > 1_500_000) return NextResponse.json({ error: '사진 포함 요청은 1.5MB 이하만 허용됩니다.' }, { status: 413 });
  const body = schema.parse(await request.json());
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const ipHash = hashIp(ip, env.ipSalt);
  if (!(await withinReportRateLimit(ipHash))) return NextResponse.json({ error: '1분당 3건까지만 제보할 수 있습니다.' }, { status: 429 });
  const report = await createReport(body, ipHash);
  return NextResponse.json({ report }, { status: 201 });
}
