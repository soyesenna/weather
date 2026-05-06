import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type PublicConfig = {
  kakaoJsKey: string;
  hasKakaoJsKey: boolean;
  deploymentOrigin: string | null;
};

export async function GET(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProto ?? (host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https');
  const kakaoJsKey = env.kakaoJsKey ?? '';
  const body: PublicConfig = {
    kakaoJsKey,
    hasKakaoJsKey: kakaoJsKey.length > 0,
    deploymentOrigin: host ? `${protocol}://${host}` : null,
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
