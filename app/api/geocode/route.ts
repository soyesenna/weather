import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { SEOUL_CENTER } from '@/lib/geo';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q');
  if (!query) return NextResponse.json({ error: 'q required' }, { status: 400 });
  if (!env.kakaoRestKey) return NextResponse.json({ fallback: true, result: { label: query, ...SEOUL_CENTER } });
  const response = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `KakaoAK ${env.kakaoRestKey}` }, cache: 'no-store'
  });
  if (!response.ok) return NextResponse.json({ fallback: true, result: { label: query, ...SEOUL_CENTER } });
  const data = await response.json();
  const first = data.documents?.[0];
  if (!first) return NextResponse.json({ fallback: true, result: { label: query, ...SEOUL_CENTER } });
  return NextResponse.json({ fallback: false, result: { label: first.address_name, lat: Number(first.y), lng: Number(first.x) } });
}
