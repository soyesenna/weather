import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createReport, getReports, hashIp, withinReportRateLimit } from '@/lib/repositories';
import { env } from '@/lib/env';
import { uploadReportPhoto } from '@/lib/storage';

const jsonSchema = z.object({
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

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const ipHash = hashIp(ip, env.ipSalt);
  if (!(await withinReportRateLimit(ipHash))) return NextResponse.json({ error: '1분당 3건까지만 제보할 수 있습니다.' }, { status: 429 });

  const contentType = request.headers.get('content-type') ?? '';
  const reportDraftId = randomUUID();
  let body: z.infer<typeof jsonSchema>;

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('photo');
    const mobilityBlock = String(form.get('mobilityBlock') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const photoUrl = file instanceof File && file.size > 0 ? await uploadReportPhoto(file, reportDraftId) : undefined;
    body = jsonSchema.parse({
      lat: Number(form.get('lat')),
      lng: Number(form.get('lng')),
      depthStep: form.get('depthStep'),
      mobilityBlock,
      memo: form.get('memo') || undefined,
      photoUrl,
    });
  } else {
    body = jsonSchema.parse(await request.json());
  }

  const report = await createReport(body, ipHash, reportDraftId);
  return NextResponse.json({ report }, { status: 201 });
}
