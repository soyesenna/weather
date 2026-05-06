# Seoul Flood Demo Completion Audit

Generated: 2026-05-06 KST

## Objective restatement

`deep-research-report.md`는 참고 리서치로만 사용하고, `.omc/specs/deep-interview-seoul-flood-demo.md`와 `.omc/plans/*`를 구현 계약으로 삼아 `DESIGN.md`의 Toss 기반 UI 규칙에 맞는 서울 도시침수 대응 Next.js fullstack 데모를 완성한다. `.env.local`의 환경변수를 사용한다.

## Prompt-to-artifact checklist

| Requirement / gate | Artifact / evidence | Status |
| --- | --- | --- |
| Spec 문서 철저 분석 | `.omc/specs/deep-interview-seoul-flood-demo.md`, `.omc/plans/seoul-flood-demo-plan.md`, README 구현 요약 | Done |
| Next.js fullstack 단일 코드베이스 | `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/api/**` | Done |
| DESIGN.md 기반 Toss UI | `app/globals.css`, `components/FloodDashboard.tsx`, mobile 390px GIF | Done |
| Supabase Postgres + PostGIS | `db/schema.sql`; verified by `pnpm db:schema` earlier in this thread | Done |
| Supabase Storage signed URL 7일, private bucket 전제 | `lib/storage.ts`, `app/api/reports/route.ts`, README | Done |
| KMA/서울/TOPIS ingest adapters | `packages/ingest/adapters.ts`; TOPIS fallback documented | Done |
| GitHub Actions 5분 cron → `/api/ingest/all` | `.github/workflows/ingest.yml`, `app/api/ingest/all/route.ts` | Done |
| Vercel cleanup cron daily 04:00 KST | `vercel.json`, `app/api/cron/cleanup/route.ts` | Done |
| 외부 snapshots `fetched_at`, `valid_at` 보존 | `db/schema.sql` `external_snapshots`; ingest smoke stored 5 snapshots | Done |
| 위험도 룰베이스 0.0~1.0 + SAFE/LOW/MEDIUM/HIGH | `packages/risk/scoring.ts`, `packages/risk/__tests__/scoring.test.ts` | Done |
| 약 250m 위험 셀 current upsert | `risk_score_current` schema, `packages/risk/demo-data.ts`, `scripts/replay-seed.ts` | Demo-seeded; production grid import is a follow-up data operation |
| `/api/risk/cells` BBox + auto aggregated fallback | `app/api/risk/cells/route.ts`; smoke saw `X-Auto-Aggregated: true` | Done |
| Kakao Map 기반 지도 | `components/FloodDashboard.tsx` uses `react-kakao-maps-sdk`; CSS fallback when key/domain unavailable | Done locally; deployment domain render pending |
| 레이어 토글: 위험/침수/대피소/펌프장/도로/수위계 | `components/FloodDashboard.tsx`, `app/api/static/layers/route.ts`; smoke counts verified | Done |
| 위치 권한 행동 카드 | `components/FloodDashboard.tsx`, `ACTION_COPY` in `packages/risk/scoring.ts` | Done |
| 가까운 대피소 거리/도보 경로 CTA | `components/FloodDashboard.tsx` | Done |
| 안전경로 HIGH 셀 통과 경고 | `app/api/route/route.ts`; smoke returned HIGH warning | Done |
| 익명 시민 제보 | `app/api/reports/route.ts`, `lib/repositories.ts` | Done |
| 사진 1장, 1.5MB server guard | `app/api/reports/route.ts`, `lib/storage.ts`; smoke 413 verified | Done |
| rate limit 동일 IP 1분 3건 | `withinReportRateLimit()` in `lib/repositories.ts` | Done |
| 운영자 콘솔 `/admin` | `app/admin/**`, `app/api/admin/**`; 401/200 smoke verified | Done |
| README env/local/deploy/API key/security docs | `README.md` | Done |
| 시스템 다이어그램 | `README.md` Mermaid diagram | Done |
| 시연 GIF/영상 | `docs/demo-assets/seoul-flood-demo.gif`; README embeds it | Done |
| Local verification | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` passed after latest changes | Done |
| DB seed verification | `pnpm seed:demo` stored 125 cells in Supabase | Done |
| API smoke verification | `/api/static/layers`, `/api/reports`, `/api/ingest/all`, `/api/route`, `/api/admin/summary` checked in this thread | Done |
| External deployed URL reachable by anyone | Requires Vercel auth/project or equivalent external deployment | Blocked |
| HTTPS on external URL | Requires external deployment | Blocked |
| Deployed Kakao map domain whitelist render | Requires final deployed domain and Kakao Developers whitelist | Blocked |

## Current blocker

The Vercel CLI is not authenticated in this environment. Evidence from this thread:

```txt
pnpm dlx vercel whoami
No existing credentials found. Starting login flow...
```

No `VERCEL_TOKEN`/project link was available. Therefore the external URL and HTTPS acceptance criteria cannot be proven from this environment without credential input.

## Deployment smoke checklist

After authenticating Vercel and deploying, run:

```bash
scripts/deployment-smoke.sh https://<deployed-url>
```

Expected checks:

1. HTTPS URL responds.
2. `/api/health` returns JSON with `ok=true`.
3. `/api/risk/cells?bbox=126.7,37.4,127.2,37.7&zoom=13` returns `X-Auto-Aggregated: true`.
4. `/api/static/layers` returns non-empty static layer arrays.
5. `/api/admin/login` rejects a wrong password with `401`.
6. Kakao Developers Web domain whitelist should include the deployed domain before visual acceptance.

## Verdict

Implementation and local verification are complete. Full objective completion remains blocked only by external deployment credentials/domain validation.
