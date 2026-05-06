import { randomUUID, createHash } from 'crypto';
import type { JSONValue } from 'postgres';
import { getSql } from './db';
import { nearestGu } from './geo';
import type { ApiHealth, CitizenReport, RiskCell } from './types';
import { demoHealth, demoReports, buildDemoRiskCells } from '@/packages/risk/demo-data';

export async function getRiskCells(options: { bbox?: [number, number, number, number]; limit?: number } = {}): Promise<RiskCell[]> {
  const sql = getSql();
  if (!sql) return filterDemoCells(options);
  try {
    const rows = await sql`
      select cell_id, gu_name, score, level, updated_at,
             st_y(center::geometry) as lat, st_x(center::geometry) as lng,
             st_xmin(bbox::box3d) as min_lng, st_ymin(bbox::box3d) as min_lat,
             st_xmax(bbox::box3d) as max_lng, st_ymax(bbox::box3d) as max_lat,
             inputs
      from risk_score_current
      ${options.bbox ? sql`where bbox && st_makeenvelope(${options.bbox[0]}, ${options.bbox[1]}, ${options.bbox[2]}, ${options.bbox[3]}, 4326)` : sql``}
      order by updated_at desc, score desc
      limit ${options.limit ?? 1500}
    `;
    if (rows.length === 0) return filterDemoCells(options);
    return rows.map((r) => ({
      cellId: r.cell_id,
      gu: r.gu_name,
      center: { lat: Number(r.lat), lng: Number(r.lng) },
      bbox: [Number(r.min_lng), Number(r.min_lat), Number(r.max_lng), Number(r.max_lat)],
      score: Number(r.score),
      level: r.level,
      updatedAt: new Date(r.updated_at).toISOString(),
      inputs: r.inputs,
    }));
  } catch (error) {
    console.error('getRiskCells fallback', error);
    return filterDemoCells(options);
  }
}

function filterDemoCells(options: { bbox?: [number, number, number, number]; limit?: number }) {
  let cells = buildDemoRiskCells();
  if (options.bbox) {
    const [minLng, minLat, maxLng, maxLat] = options.bbox;
    cells = cells.filter((c) => c.center.lng >= minLng && c.center.lng <= maxLng && c.center.lat >= minLat && c.center.lat <= maxLat);
  }
  return cells.slice(0, options.limit ?? 1500);
}

export async function getAggregatedRisk() {
  const cells = await getRiskCells({ limit: 5000 });
  const grouped = new Map<string, { gu: string; maxScore: number; avgScore: number; count: number; highCount: number; updatedAt: string }>();
  for (const cell of cells) {
    const prev = grouped.get(cell.gu) ?? { gu: cell.gu, maxScore: 0, avgScore: 0, count: 0, highCount: 0, updatedAt: cell.updatedAt };
    prev.maxScore = Math.max(prev.maxScore, cell.score);
    prev.avgScore += cell.score;
    prev.count += 1;
    prev.highCount += cell.level === 'HIGH' ? 1 : 0;
    if (cell.updatedAt > prev.updatedAt) prev.updatedAt = cell.updatedAt;
    grouped.set(cell.gu, prev);
  }
  return [...grouped.values()].map((g) => ({ ...g, avgScore: Math.round((g.avgScore / Math.max(1, g.count)) * 1000) / 1000 }));
}

export async function getReports(limit = 50): Promise<CitizenReport[]> {
  const sql = getSql();
  if (!sql) return demoReports.slice(0, limit);
  try {
    const rows = await sql`
      select id, gu_name, lat, lng, depth_step, mobility_block, memo, photo_url, created_at
      from citizen_reports
      order by created_at desc
      limit ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      gu: r.gu_name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      depthStep: r.depth_step,
      mobilityBlock: r.mobility_block ?? [],
      memo: r.memo ?? undefined,
      photoUrl: r.photo_url ?? undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  } catch (error) {
    console.error('getReports fallback', error);
    return demoReports.slice(0, limit);
  }
}

export async function createReport(input: Omit<CitizenReport, 'id' | 'gu' | 'createdAt'>, ipHash: string, id = randomUUID()) {
  const gu = nearestGu(input.lat, input.lng);
  const report: CitizenReport = { ...input, id, gu, createdAt: new Date().toISOString() };
  const sql = getSql();
  if (!sql) return report;
  await sql`
    insert into citizen_reports (id, gu_name, lat, lng, depth_step, mobility_block, memo, photo_url, ip_hash)
    values (${report.id}, ${report.gu}, ${report.lat}, ${report.lng}, ${report.depthStep}, ${report.mobilityBlock}, ${report.memo ?? null}, ${report.photoUrl ?? null}, ${ipHash})
  `;
  return report;
}

export async function withinReportRateLimit(ipHash: string) {
  const sql = getSql();
  if (!sql) return true;
  const rows = await sql`select count(*)::int as count from citizen_reports where ip_hash = ${ipHash} and created_at > now() - interval '1 minute'`;
  return Number(rows[0]?.count ?? 0) < 3;
}

export function hashIp(ip: string, salt: string) {
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

export async function getHealth(): Promise<ApiHealth[]> {
  const sql = getSql();
  if (!sql) return demoHealth();
  try {
    const rows = await sql`
      select provider, status, last_success_at, failure_count_1h, message
      from api_ingest_health
      order by provider
    `;
    if (rows.length === 0) return demoHealth();
    return rows.map((r) => ({ provider: r.provider, status: r.status, lastSuccessAt: r.last_success_at?.toISOString(), failureCount1h: Number(r.failure_count_1h ?? 0), message: r.message ?? '' }));
  } catch (error) {
    console.error('getHealth fallback', error);
    return demoHealth();
  }
}

export async function upsertRiskCells(cells: RiskCell[]) {
  const sql = getSql();
  if (!sql) return { stored: 0, fallback: true };
  for (const c of cells) {
    await sql`
      insert into risk_score_current (cell_id, gu_name, score, level, center, bbox, inputs, updated_at)
      values (${c.cellId}, ${c.gu}, ${c.score}, ${c.level}, st_setsrid(st_makepoint(${c.center.lng}, ${c.center.lat}),4326)::geography,
              st_makeenvelope(${c.bbox[0]}, ${c.bbox[1]}, ${c.bbox[2]}, ${c.bbox[3]}, 4326), ${sql.json(c.inputs)}, ${c.updatedAt})
      on conflict (cell_id) do update set score=excluded.score, level=excluded.level, center=excluded.center, bbox=excluded.bbox, inputs=excluded.inputs, updated_at=excluded.updated_at
    `;
  }
  return { stored: cells.length, fallback: false };
}

export async function upsertHealth(health: ApiHealth[]) {
  const sql = getSql();
  if (!sql) return;
  for (const h of health) {
    await sql`
      insert into api_ingest_health (provider, status, last_success_at, failure_count_1h, message)
      values (${h.provider}, ${h.status}, ${h.lastSuccessAt ?? null}, ${h.failureCount1h}, ${h.message})
      on conflict (provider) do update set status=excluded.status, last_success_at=excluded.last_success_at, failure_count_1h=excluded.failure_count_1h, message=excluded.message, updated_at=now()
    `;
  }
}


export async function insertExternalSnapshots(snapshots: Array<{ provider: string; endpoint: string; fetchedAt: string; validAt?: string; payload: JSONValue }>) {
  const sql = getSql();
  if (!sql) return { stored: 0, fallback: true };
  for (const snapshot of snapshots) {
    const payload = snapshot.payload;
    await sql`
      insert into external_snapshots (provider, endpoint, fetched_at, valid_at, payload)
      values (${snapshot.provider}, ${snapshot.endpoint}, ${snapshot.fetchedAt}, ${snapshot.validAt ?? null}, ${sql.json(payload)})
    `;
  }
  return { stored: snapshots.length, fallback: false };
}
