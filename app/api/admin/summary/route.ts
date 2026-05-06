import { NextResponse } from 'next/server';
import { getHealth, getReports, getRiskCells } from '@/lib/repositories';
import { isAdminSession } from '@/lib/admin-auth';

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [cells, reports, health] = await Promise.all([getRiskCells({ limit: 5000 }), getReports(50), getHealth()]);
  return NextResponse.json({
    topCells: cells.sort((a, b) => b.score - a.score).slice(0, 20),
    reports,
    health,
  });
}
