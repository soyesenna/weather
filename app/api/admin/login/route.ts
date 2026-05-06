import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';
import { signAdminSession } from '@/lib/admin-auth';

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function POST(request: Request) {
  const { password } = await request.json();
  const expected = env.adminPassword ?? 'admin-demo';
  if (!safeEqual(String(password ?? ''), expected)) return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  const value = `admin.${Date.now()}`;
  const jar = await cookies();
  jar.set('admin_session', `${value}.${signAdminSession(value)}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 });
  return NextResponse.json({ ok: true });
}
