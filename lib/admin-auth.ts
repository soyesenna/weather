import { cookies } from 'next/headers';
import { createHmac } from 'crypto';
import { env } from './env';

export function signAdminSession(value: string) {
  return createHmac('sha256', env.sessionSecret ?? 'demo-session').update(value).digest('hex');
}

export async function isAdminSession() {
  const jar = await cookies();
  const raw = jar.get('admin_session')?.value;
  if (!raw) return false;
  const [role, ts, sig] = raw.split('.');
  if (role !== 'admin' || !ts || !sig) return false;
  return signAdminSession(`${role}.${ts}`) === sig;
}
