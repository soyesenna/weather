# Seoul Flood Demo — Implementation Plan v3 (Planner revision)

- Source spec: `.omc/specs/deep-interview-seoul-flood-demo.md`
- Architect review v1: `.omc/plans/architect-review-v1.md` (Verdict: NEEDS_PLANNER_REVISION → v2 응답 → v3 patch 통합)
- Mode: RALPLAN consensus (SHORT)
- Target executor: 학생 솔로 1인, **14~17주** (v1의 11주 하단 폐기)
- Stack: Next.js fullstack(TypeScript, App Router) + Postgres+PostGIS(Supabase) + Vercel + GitHub Actions cron 1개 + Kakao Maps
- Generated: 2026-05-06 (v3)

---

## Changelog v2 → v3

deep-interview 잔여 검토 6라운드 완료, 12개 patch lock-in 통합. **Architect 신규 발견 3건**: D-1 (AC 매핑 표 C5 비고 보강 — 단일 SQL upsert로 5~10분 보장 + ADR-008 archive 분리 명시), D-2 (ADR-008 Decision 갱신 — archive INSERT 트리거·데이터 출처는 P8 진입 시점 결정, 지금은 스키마와 `scripts/replay-seed.ts` 골격만 준비, production cron의 dual-write 없음), D-3 (ADR-007 Consequences + API 5.1 — `/api/risk/cells`가 BBox > 50km² 또는 매칭 셀 > 1,500 인 요청을 받으면 자동 aggregated 응답 graceful degrade, `X-Auto-Aggregated` 헤더 + `auto_aggregated: true` + `gus: [...]` 구조, 409 거부 폐기). **Critic important 3건**: C-1 (환경변수 표 + README Security 섹션 — `openssl rand -hex 32`, INGEST_TOKEN/ADMIN_PASSWORD/SESSION_SECRET/IP_SALT 시연 직전 회전, `.env*` `.gitignore` 검사), C-5 (Phase 5 + ADR-002 — Supabase Storage signed URL TTL **1주(7일)**, bucket private), C-8 (Phase 5 photo-upload — server-side `Content-Length > 1.5MB` 즉시 413 reject, 클라이언트 1MB cap 우회 방어, bucket size limit policy). **Nice-to-have 6건**: P0 buffer (1주 → **1.0~1.25주**, KMA 운영키·Kakao 화이트리스트·Supabase activation 동기 의존), P3 fallback 임계 (ADR-006 — 60s 1회 발생 시 즉시 chunk fallback 활성, 자치구 5개 단위 5회 단일 SQL, 재발 시 admin/health alert), P5 Non-Goal 가드 (시민 제보 신뢰도 자동검증 금지, 클러스터링도 P7 운영자만), README 디버깅 섹션 (Vercel Logs / GH Actions / Supabase logs 3줄), P6 fallback 좌표·단위 (haversine m 소수점 0자리, 흰색 stroke 4px, ST_Intersects fallback도 동일 SQL), README 다이어그램 임계 (박스 6개 + 화살표 5개, PNG 또는 mermaid). **C-3 (tier 한도 모니터링)은 사용자 결정으로 제외 — 데모급 맥락에서 시연 직전 수동 quota 체크로 충분.** 사용자 확정 6건 모두 권장안 그대로 사용자 직접 lock-in. ADR-002·006·007·008 4개 갱신, ADR-001/003/004/005 변경 없음.

---

## Changelog v1 → v2

Architect v1 review의 silent contradiction 2건과 시급 5개 수정 + 추가 권장 9개를 모두 반영했습니다. 핵심 변경: (1) Vercel Cron 6개 가정을 폐기하고 **GitHub Actions cron 1개 + `/api/ingest/all` 단일 endpoint**로 통합 lock-in, (2) risk-recalc fan-out("1자치구씩 25배 호출") 폐기 → **단일 SQL upsert + `runtime='nodejs'` + `maxDuration=60`**으로 spec AC-C5 "5~10분 주기" 보장, (3) 정적 GeoJSON 25분할 폐기 → **DB+BBox API + zoom 14 분기 (`/api/risk/cells` ↔ `/api/risk/aggregated`)**, (4) `risk_score_snapshot`을 `risk_score_current`(셀당 1행 upsert) + 옵션 `risk_score_archive`로 격하 (일일 row 1.4M → 9.7K), (5) 셀 카운트 산식을 **약 9,700 셀(605km² ÷ 0.25km × 0.25km = 9,680, 자치구 클립 후 ≈ 9,700)**로 단일화.

추가로 KMA 운영 키 신청·Kakao 도메인 화이트리스트를 Phase 0에 lock-in, TOPIS degradation tier(R_road=0 fallback), `StaleBanner.tsx`, 시계열 72시간 보존 + 일일 cleanup cron, Supabase Storage lock-in(ADR-002 갱신), Playwright e2e를 Phase 8 옵션으로 격하, 일정을 14~17주로 좁히고 Phase 1을 3.5~4주·Phase 3을 3~4주로 확장하면서 "Phase 3 = 단일 Phase 중 가장 위험"으로 명시. ADR은 v1의 4개에 ADR-005(cron 통합)·ADR-006(단일 SQL upsert)·ADR-007(격자 송출 모델)·ADR-008(시계열 보존 + archive 분리) 4개를 신설하고 ADR-002·ADR-003은 v2 사항에 맞춰 갱신.

---

## 0. 셀 카운트 산식 (전체 plan에서 단일 표기)

```
서울 면적          = 605.21 km²
셀 한 변           = 0.25 km
셀 면적            = 0.0625 km²
이론 셀            = 605.21 / 0.0625 = 9,683
자치구 경계 클립 후 = 약 9,700 셀     (이하 "약 9,700 셀"로 일관 표기)
```

본 plan의 모든 추정치(DB 용량, GeoJSON, timeout, row 카운트)는 이 9,700 기준.

---

## 1. RALPLAN-DR 요약

### 1.1 Principles (5)

1. **단일 코드베이스 우선** — Next.js fullstack 한 레포에서 시민·운영자·API 모두 처리. GitHub Actions cron 1개는 워크플로우 파일이 같은 레포 안에 있으므로 본 원칙은 코드 위치 기준으로 유지(섹션 1.4 정당화 참조).
2. **외부 인프라 의존 최소화** — Vercel + Supabase(DB+Storage+Auth 번들) + GitHub Actions(레포 기본 제공) 외 추가 인프라 금지. K8s/Kafka/Redis broker/MLflow 절대 금지.
3. **외부 API 호출이 실패해도 UI는 죽지 않는다** — 모든 어댑터는 `data_source_health`에 last-success 기록. 모든 페이지에 공통 `StaleBanner.tsx` (5분 초과 노랑, 30분 초과 빨강).
4. **데이터 신선도 표시가 정확도보다 우선** — 위험점수 절대 정확도보다 "마지막 갱신 N분 전"의 정직성이 우선. UI에 룰베이스/데모 명시.
5. **검증 가능한 acceptance criteria만 채택** — 17개 그룹 AC를 39개 세부 AC로 분해하여 Phase 매핑 표(섹션 12)로 추적.

### 1.2 Decision Drivers (top 3)

1. **솔로 1인 14~17주 budget** — 모든 결정은 "이게 학생 1명이 끝낼 수 있는가"로 필터.
2. **공공 API 무료 쿼터/제약** — KMA 일반키 1K~10K/일, 운영키 별도 신청. Kakao 일일 5K. 키 발급 지연이 최대 차단 위험.
3. **Vercel 서버리스 한계** — Hobby cron 정책 미검증 → GitHub Actions로 우회. 함수 timeout(Hobby 60s, Edge 25s) 안에서 단일 SQL upsert로 처리.

### 1.3 Viable Options (4개 결정 — v2 lock-in)

#### 결정 1. DB·Storage 호스팅

| 옵션 | Pros | Cons |
|---|---|---|
| **Supabase (DB + Storage 모두)** Locked | PostGIS 기본 활성, Storage 1GB Free, Auth·SQL editor 무료 번들, 키 1세트 | 무료 plan 7일 무활동 시 일시정지 |
| Neon + Vercel Blob | Neon 분기 강력, Blob 통합 깔끔 | 두 vendor, secret 2세트 |
| Vercel Postgres + Vercel Blob | Vercel 안에서 일체화 | Neon 기반이라 본질 차이 작음, 가격 상향 |

**Locked: Supabase (DB+Storage 통일)** — 근거: Storage까지 Supabase로 통일하여 vendor 1개로 운영. ADR-002에 lock-in.

#### 결정 2. 격자 송출 모델

| 옵션 | Pros | Cons |
|---|---|---|
| **DB 보존 + BBox API + zoom 분기** Locked | 클라이언트 viewport 안 1~2K 셀만 fetch, vector tile 도입 불필요. zoom < 14는 자치구 집계 응답으로 페이로드 ≤ 25행 | 모든 폴리곤이 DB 응답이라 첫 fetch 200~500ms |
| 정적 GeoJSON 25분할(v1 안) | 빌드시 1회, 런타임 비용 0 | ~30MB 분할 부담, 점수와 합본 송출 어려움, BBox 분기 미지원 |
| PostGIS 동적 격자 + 점수 join | 코드 한 줄 | 매 요청 비용·timeout 위험 |

**Locked: DB+BBox API + zoom 14 분기** (zoom ≥ 14: 셀 폴리곤, zoom < 14: 자치구 집계). spec AC-D4의 "또는"을 **둘 다(zoom 14 분기점)**으로 명문화. ADR-007에 lock-in.

#### 결정 3. 외부 API 폴링 메커니즘

| 옵션 | Pros | Cons |
|---|---|---|
| **GitHub Actions cron 1개 + `/api/ingest/all`** Locked | Hobby cron 정책 의존 0, secret은 GH Actions secret 1세트, 시간제한 6h 여유, 전체 실행 1회 로그로 디버깅 단순 | "외부 인프라 최소" 원칙에 약 위배(섹션 1.4 정당화) |
| Vercel Cron 6개 | Vercel 안에서 일체 | Hobby 상한 미검증, fan-out 강제 → AC-C5 위반 위험 |
| Edge + 사용자 트리거 | 비용 0 | spec AC 위반 |

**Locked: GitHub Actions cron 1개** — 워크플로우 파일은 같은 레포 안(`.github/workflows/ingest.yml`)에 있으므로 단일 코드베이스 원칙 위배 없음. ADR-005에 lock-in.

#### 결정 4. 운영자 인증

| 옵션 | Pros | Cons |
|---|---|---|
| **단일 비밀번호 ENV + iron-session 쿠키** Locked | 1시간 안에 구현, 의존성 0 | 다중 운영자 불가, 회전은 redeploy |
| Kakao Login + 화이트리스트 | 시민 로그인과 코드 재사용 | OAuth 콜백·토큰 회전 복잡 |
| NextAuth + Magic Link | 표준 | SMTP 키 추가 |

**Locked: 단일 비밀번호 ENV** — 데모급 충분.

### 1.4 Principle 1 약 위배 정당화 (GitHub Actions cron)

GitHub Actions가 외부 인프라이긴 하나 (a) 워크플로우 파일이 같은 레포 안에 있어 코드 위치 기준 단일 코드베이스 유지, (b) 학생 plan에서 GitHub은 이미 git 호스팅으로 강제 의존, (c) Vercel Hobby cron 6개 가정 미검증의 차단 위험이 더 큼, (d) GH Actions cron secret 1세트는 Vercel env로 sync 없이 별도 관리하지 않음(별도 PAT 1개만). 따라서 약 위배를 수용.

---

## 2. Phase별 세분화 플랜 (8 Phase, **14~17주**)

각 Phase는 spec AC와 Phase 매핑 표(섹션 12)로 추적.

---

### Phase 0 — 셋업 (1.0~1.25주, 누적 1.0~1.25주)

**목표**: 개발·DB·배포·외부 API 키(운영 계정 포함)·Kakao 도메인 화이트리스트가 모두 통과되고 `pnpm dev` + 헬스체크가 Vercel preview에 뜬다.

**체크리스트**
- [ ] (AC-A1) Vercel preview URL 외부 접속 OK
- [ ] (AC-A2) HTTPS (Vercel 기본)
- [ ] (AC-A3) README skeleton(환경변수 표 포함)
- [ ] Supabase 프로젝트 생성, `CREATE EXTENSION postgis;`, `SELECT postgis_full_version()` OK
- [ ] **Kakao Developers**: JS키와 REST키 분리 발급, 도메인 화이트리스트에 `http://localhost:3000`, `https://*.vercel.app`, 시연 도메인 등록
- [ ] **KMA 일반 인증키 신청**(즉시 발급) + **운영 계정 신청 동시 접수**(1~5영업일, 발급 도착 시 swap)
- [ ] 서울 열린데이터광장 키 신청
- [ ] TOPIS 키 신청 (degradation tier 적용 — 미발급 시에도 P1 진행)
- [ ] `apps/web/app/api/health/route.ts`가 `{ db: "ok", postgis: "ok", sources: [...] }` 리턴

**파일 트리(생성)**
```
/weather
├── package.json (pnpm workspace root)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── README.md (skeleton)
├── .github/workflows/
│   └── ingest.yml          (Phase 1에서 채움, skeleton만)
├── apps/web/
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── package.json
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx (placeholder)
│       └── api/health/route.ts
└── packages/
    ├── db/ (schema.ts, migrations/)
    ├── ingest/ (placeholder)
    ├── risk/ (placeholder)
    └── geo/ (placeholder)
```

**핵심 라이브러리·외부 API**: `next@14`, `react@18`, `pnpm`, Drizzle ORM + `postgres` 드라이버, `proj4`. Supabase·Kakao Developers·KMA·서울 열린데이터·TOPIS 콘솔.

**검증 방법**: `pnpm install && pnpm --filter web dev` localhost OK, Vercel preview `/api/health` 200, `psql $DATABASE_URL -c "select postgis_version();"`.

**예상 소요**: **1.0~1.25주** — KMA 운영키 영업일 + Kakao 화이트리스트 + Supabase activation 동기 의존으로 빠듯, 0.25주 슬라이드 수용. Phase 1은 일반키로 시작 가능.

**차단 가능 위험**: KMA 운영키 영업일 지연 → 일반키 1K~10K/일로 P1 진행, 도착 시 swap. Kakao 화이트리스트 누락 시 지도 미표출 → P0 마지막 날 모바일 + Vercel preview에서 1회 sanity check.

---

### Phase 1 — 외부 데이터 어댑터 + GitHub Actions cron 통합 (3.5~4주, 누적 4.5~5주)

**목표**: KMA(2종) + 서울 하천·하수 + TOPIS 5개 어댑터 fixture 단위테스트 통과 + GitHub Actions cron 1개가 5분마다 `/api/ingest/all`을 호출하여 5개 어댑터를 `Promise.allSettled`로 실행하고, `data_source_health`에 last-success 기록.

**체크리스트**
- [ ] (AC-B1) `getUltraSrtNcst` 5~10분 주기
- [ ] (AC-B2) `getUltraSrtFcst` 1시간 주기 (`/api/ingest/all`이 매 12회째에만 호출 — `if minute % 60 == 0`)
- [ ] (AC-B3) 서울 하천 수위 10분 주기 (매 2회째)
- [ ] (AC-B4) 서울 하수관로 수위 10분 주기 (매 2회째)
- [ ] (AC-B5) TOPIS 5~10분 주기 — **degradation tier**: 키 미발급 시 R_road=0 fallback, AC-B5는 "수집"만 필수 (룰 영향은 옵션). 가중치 표(섹션 6)에 각주 명시.
- [ ] (AC-B6) 침수예상도·대피소·펌프장은 P2에서 1회 적재 (P1 책임 아님)
- [ ] (AC-B7) 모든 외부 API 결과는 시계열 테이블에 `fetched_at`/`valid_at` 보존 — **72시간 후 일일 cleanup으로 삭제** (옵션 archive는 P8에서 호우일만)
- [ ] (AC-B8) 실패시 `p-retry` 재시도 + 에러 로깅 + `data_source_health` 갱신 (UI 노출은 P2 `StaleBanner.tsx` + P7 admin/health)

**파일 트리**
```
.github/workflows/ingest.yml         # cron: '*/5 * * * *' → curl POST /api/ingest/all
                                       # secrets: INGEST_TOKEN (서버에서 X-Ingest-Token 검증)

packages/ingest/src/
├── index.ts
├── http.ts                          (fetch + p-retry + 타임아웃 8s)
├── kma/{ncst,fcst,grid}.ts
├── seoul/{river,drainpipe}.ts
├── topis/events.ts
└── __tests__/                       (vitest fixture)

apps/web/app/api/
├── ingest/all/route.ts              # POST, X-Ingest-Token 검증, Promise.allSettled로 5 어댑터 호출
└── cron/cleanup/route.ts            # 일일 04:00 KST, 72h 초과 시계열 row DELETE (또는 pg_cron)

packages/db/schema.ts                (kma_grid_obs, river_stage, drainpipe_stage, topis_event, data_source_health)
```

**GitHub Actions cron 정의 (skeleton)**
```yaml
# .github/workflows/ingest.yml
name: ingest-cron
on:
  schedule:
    - cron: '*/5 * * * *'   # 5분 주기
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf -X POST "$DEPLOY_URL/api/ingest/all" \
               -H "X-Ingest-Token: $TOKEN" \
               --max-time 90 || exit 1
        env:
          DEPLOY_URL: ${{ secrets.DEPLOY_URL }}
          TOKEN:      ${{ secrets.INGEST_TOKEN }}
```

**핵심 라이브러리·외부 API**: `p-retry`, `vitest`, `zod`. KMA `apis.data.go.kr/...VilageFcstInfoService_2.0/...`, 서울 `openapi.seoul.go.kr/...ListRiverStageService|DrainpipeMonitoringInfo`, TOPIS 개방 API 또는 RSS.

**검증 방법**: `pnpm test packages/ingest` 그린, 배포 후 1일 → `select count(*), max(fetched_at) from kma_grid_obs;` 채워짐, `/api/health` sources 5개 모두 last_success_at 최신, GH Actions Actions 탭에서 ping 성공 로그.

**예상 소요**: **3.5~4주** (Architect 권장)

**차단 가능 위험**:
- KMA 격자(nx/ny) 변환 미스 → KMA 공식식 + 서초/강남 sanity test.
- TOPIS 키 지연 → degradation tier로 진행.
- `/api/ingest/all` 단일 호출이 Hobby 60s 초과 → `Promise.allSettled`이 외부 호출 5개 병렬, 각 어댑터 max 8s 타임아웃, 합산 ≤ 30s 예상 안전.

---

### Phase 2 — 정적 지도 + 자치구·정적 레이어 + StaleBanner (2주, 누적 6.5~7주)

**목표**: Kakao Map 서울 전역 초기 줌 + 자치구 경계·침수예상도·대피소·펌프장 GeoJSON 토글 + 모든 페이지 공통 `StaleBanner.tsx` 노출.

**체크리스트**
- [ ] (AC-D1) Kakao Map, 서울 전역 초기 줌
- [ ] (AC-B6) 침수예상도·대피소·펌프장 정적 1회 적재 (`scripts/seed-*.ts`)
- [ ] (AC-D3 부분) 4개 정적 레이어 토글
- [ ] 자치구 경계 25개 GeoJSON 정합 (`gu_boundary`)
- [ ] **`StaleBanner.tsx`** 글로벌 — `/api/health` polling, 가장 오래된 source 기준 5분 초과 노랑, 30분 초과 빨강 (principle 4 이행)

**파일 트리**
```
apps/web/app/(public)/page.tsx       (메인 지도)
apps/web/app/layout.tsx              (StaleBanner 슬롯)
apps/web/components/
├── KakaoMap.tsx
├── LayerToggle.tsx
├── StaleBanner.tsx                  ← 신설 (Architect 권장 D)
└── layers/
    ├── GuBoundaryLayer.tsx
    ├── ShelterLayer.tsx
    ├── PumpLayer.tsx
    └── FloodForecastLayer.tsx

apps/web/app/api/layers/
├── shelters/route.ts
├── pumps/route.ts
└── flood-forecast/route.ts

packages/geo/src/
├── proj.ts                          (4326↔5186, SRID 5186 자치구 SHP)
└── shp-to-geojson.ts                (1회용)

scripts/
├── seed-gu-boundary.ts
├── seed-shelter.ts
├── seed-pump.ts
└── seed-flood-forecast.ts
```

**핵심 라이브러리·외부 API**: `react-kakao-maps-sdk`, `mapshaper` CLI. 서울 열린데이터광장 SHP(SRID 5186) → GeoJSON(4326) 변환.

**검증 방법**: 배포 URL 줌·팬 OK, 4개 레이어 토글 OK, `select ST_Area(geom::geography)/1e6 from gu_boundary;` 합 ≈ 605km², `StaleBanner` 인위적으로 cron 끈 후 5분 경과 시 노랑 노출.

**예상 소요**: 2주

**차단 가능 위험**: SHP 좌표계(EPSG:5186/5179/5181) 혼재 → 변환 스크립트에 source CRS 명시 + 1회 산정 후 4326 고정.

---

### Phase 3 — 격자 + 룰베이스 위험 셀 + 단일 SQL upsert (3~4주, 누적 9.5~11주) — **단일 Phase 중 가장 위험**

**목표**: 약 9,700 셀 격자 + 단일 SQL upsert로 5~10분 주기 위험점수 갱신 + 4단계 등급 + zoom 14 분기 송출.

**체크리스트**
- [ ] (AC-C1) 250m 격자 약 9,700 셀, 자치구 경계 정합
- [ ] (AC-C2) 5개 입력 결합 점수 0.0~1.0 (TOPIS 미발급 시 R_road=0)
- [ ] (AC-C3) SAFE/LOW/MEDIUM/HIGH 4단계 색상
- [ ] (AC-C4) 산정 공식·가중치 README와 코드 주석에 명시 (섹션 6)
- [ ] (AC-C5) **5~10분 주기** — `/api/ingest/all` 안에서 risk-recalc를 단일 SQL upsert로 호출. 한 번에 약 9,700 셀 갱신. fan-out 폐기.
- [ ] (AC-D2) 위험 셀 컬러 오버레이
- [ ] (AC-D4) **zoom 14 분기**: zoom ≥ 14 → `/api/risk/cells` (셀 폴리곤), zoom < 14 → `/api/risk/aggregated` (자치구 집계)

**파일 트리**
```
packages/geo/src/
├── grid.ts                          (PostGIS ST_SquareGrid → INSERT, 1회)
└── cell-id.ts                       (S25-{row}-{col})

packages/risk/src/
├── inputs.ts                        (5개 input 정규화 SQL CTE)
├── score.ts                         (가중합 SQL)
├── thresholds.ts                    (등급 임계, 가중치 초기값)
├── recalc.ts                        (단일 SQL: INSERT INTO risk_score_current ... ON CONFLICT ... DO UPDATE)
└── __tests__/scenarios.test.ts

apps/web/app/api/
├── risk/cells/route.ts              (zoom ≥ 14, BBox)
├── risk/aggregated/route.ts         (zoom < 14, 자치구 집계)
└── ingest/all/route.ts              (P1에서 추가, 여기서 risk.recalc() 호출 추가)

apps/web/components/layers/RiskCellLayer.tsx
apps/web/components/layers/RiskGuLayer.tsx       (zoom < 14)

scripts/build-grid.ts                (1회: 약 9,700 셀 INSERT)
```

**risk-recalc 단일 SQL upsert (개념)**
```sql
-- runtime='nodejs', maxDuration=60
INSERT INTO risk_score_current (cell_id, valid_at, score, level, inputs)
SELECT
  c.cell_id,
  now() AS valid_at,
  LEAST(1.0, GREATEST(0.0,
    0.40 * r_rain + 0.20 * r_river + 0.20 * r_drain + 0.15 * r_overlap + 0.05 * r_road
  )) AS score,
  CASE
    WHEN score >= 0.70 THEN 'HIGH'
    WHEN score >= 0.45 THEN 'MED'
    WHEN score >= 0.20 THEN 'LOW'
    ELSE 'SAFE'
  END AS level,
  jsonb_build_object(...) AS inputs
FROM risk_cell c
LEFT JOIN ( /* CTE: 셀별 R_rain ... R_road 계산 */ ) inp ON c.cell_id = inp.cell_id
ON CONFLICT (cell_id)
DO UPDATE SET valid_at = EXCLUDED.valid_at,
              score    = EXCLUDED.score,
              level    = EXCLUDED.level,
              inputs   = EXCLUDED.inputs;
```

약 9,700 셀 단일 SQL은 PostGIS spatial index와 함께 ~5~15s 예상. `maxDuration=60` 안전 마진.

**핵심 라이브러리·외부 API**: PostGIS `ST_SquareGrid`, `ST_Intersection`, `ST_Centroid`, `ST_DWithin`. PostGIS 사전 학습 자료: 공식 워크북 `https://postgis.net/workshops/postgis-intro/`, `ST_SquareGrid` 레퍼런스(`https://postgis.net/docs/ST_SquareGrid.html`).

**검증 방법**: `pnpm test packages/risk` 시나리오 4개 그린, 배포 후 cron 1시간 → `select max(valid_at), count(*) from risk_score_current;` 9,700 row + valid_at 최신, 시민 지도 zoom 13 자치구 색상 / zoom 15 셀 색상 가시화.

**예상 소요**: **3~4주** (단일 Phase 중 가장 위험 — PostGIS+가중합+BBox+zoom 분기 4중 결합. 1주 디버깅 버퍼 포함)

**차단 가능 위험**:
- 단일 SQL upsert가 60s 초과 → 자치구 단위 5개 chunk(`WHERE gu_code = ANY(...)`)로 분리, `Promise.allSettled` 병렬. spec AC-C5는 "5~10분 주기"이므로 chunk가 한 호출 안에 모두 끝나면 위반 없음.
- 격자 빌드 시간 초과 → `scripts/build-grid.ts`는 로컬에서 1회만, 배포에 영향 없음.
- BBox 응답 셀 수 ≤ 1,500 cap — 초과 시 server-side downsample 또는 zoom 권장 응답.

---

### Phase 4 — 시민 화면 핵심 흐름 + 행동 카드 (1.5주, 누적 11~12.5주)

**목표**: 위치 권한 → 현재 셀 카드 + 등급별 한국어 문구 + 가까운 대피소 거리·도보 경로 버튼.

**체크리스트**
- [ ] (AC-D5) 위치 권한 → 현재 셀 카드
- [ ] (AC-D6) 등급별 한국어 행동 문구
- [ ] (AC-D7 거리) 가까운 대피소 거리 (경로 버튼은 P6과 연결)
- [ ] (AC-D3 마무리) 위험 셀 토글 포함 6개 레이어 토글 (자치구 집계 토글 포함 7개)

**파일 트리**
```
apps/web/app/(public)/page.tsx       (확장)
apps/web/components/
├── ActionCard.tsx
├── NearbyShelterButton.tsx
└── GeolocationGuard.tsx

apps/web/lib/
├── action-text.ts                   (SAFE/LOW/MED/HIGH 한국어 문구)
└── geo-distance.ts                  (haversine)

apps/web/app/api/
├── risk/here/route.ts               (lat/lon → 현재 셀 점수)
└── shelters/nearest/route.ts        (lat/lon → 1개)
```

**행동 카드 한국어 문구 초안**
- SAFE: "현재 지역은 안전합니다. 일반 활동을 유지하세요."
- LOW: "약한 침수 가능성. 저지대·지하 출입 시 주의하세요."
- MED: "침수 우려. 무릎 이상 보행 자제, 차량 우회 권장."
- HIGH: "이 지역 통행 자제. 가까운 대피소를 확인하세요."

**핵심 라이브러리·외부 API**: 브라우저 Geolocation API, Kakao Local(좌표→주소), PostGIS `ST_DWithin`/`ST_Distance`(geography 캐스팅).

**검증 방법**: 모바일 Chrome 위치 허용 → 카드, 거부 → 카드 숨김. 수동 smoke (모바일 1대 + 데스크톱 1회).

**예상 소요**: 1.5주

**차단 가능 위험**: HTTPS·iOS Safari Geolocation 흐름. 회피: Vercel preview HTTPS만 사용, iOS 실기기 1회 검증.

---

### Phase 5 — 시민 제보 (1~1.5주, 누적 12~14주)

**목표**: 익명 제보 폼 + Supabase Storage 사진 + 자기 마커·자치구 마커 + IP rate limit.

**체크리스트**
- [ ] (AC-F1) 익명 제보 (Kakao Login 옵션, 기본 OFF)
- [ ] (AC-F2) 좌표·물높이(4단계)·통행불가(보행/유모차/휠체어/차량)·메모·사진 1장(선택)
- [ ] (AC-F3) 즉시 자기 마커 (optimistic UI)
- [ ] (AC-F4) 같은 자치구 모든 제보가 시민 지도 + 운영자 콘솔 노출
- [ ] (AC-F5) 동일 IP 1분당 3건 이하
- [ ] **photo-upload TTL (C-5)**: Supabase Storage signed URL TTL = **1주(7일)**. Storage bucket은 private. 시민 제보 마커가 1주 후 깨질 가능성은 데모급 수용.
- [ ] **photo-upload server 검증 (C-8)**: server-side `Content-Length > 1.5MB` 즉시 reject (413 응답). 클라이언트 1MB cap(`browser-image-compression`) 우회 방어. Supabase Storage bucket size limit policy 추가.
- [ ] **Non-Goal 가드 (P5)**: 시민 제보 신뢰도 자동검증 알고리즘 절대 금지(spec Non-Goals). 운영자가 목록만 보면 됨. 같은 위치 클러스터링도 P7 운영자 콘솔에서만, 시민 화면에서는 안 함.

**파일 트리**
```
apps/web/app/(public)/report/page.tsx
apps/web/components/
├── ReportForm.tsx                   (RHF + zod)
└── ReportMarkerLayer.tsx

apps/web/app/api/reports/
├── route.ts                         (POST 생성, GET 자치구별 목록 — Content-Length 413 가드)
└── _lib/
    ├── rate-limit.ts                (IP hash + Postgres window count)
    └── photo-upload.ts              (Supabase Storage signed URL TTL=1주, bucket private)

packages/db/schema.ts                (citizen_report)
```

**핵심 라이브러리·외부 API**: `react-hook-form`, `zod`, `@supabase/supabase-js` (Storage signed URL), `browser-image-compression`(클라이언트 1MB cap), `crypto` IP hash.

**검증 방법**: 수동 smoke (폼 제출 → 마커 + DB row 1, 1분에 4번째 제출 시 429). Playwright는 P8 옵션.

**예상 소요**: 1~1.5주

**차단 가능 위험**: Supabase Storage 1GB Free 초과 → 클라이언트 리사이즈 + 1MB cap. Playwright 셋업 비용은 P8로 격하하여 P5 일정 보호.

---

### Phase 6 — 안전경로 (1.5~2주, 누적 13.5~16주)

**목표**: 주소→좌표 + 도보·차량 경로 + HIGH 셀 통과 경고 + 가능시 대안 1건.

**체크리스트**
- [ ] (AC-E1) Kakao Local 주소→좌표
- [ ] (AC-E2) 도보·차량 경로 — Mobility 미발급 시 직선+거리 fallback
- [ ] (AC-E3) HIGH 셀 통과 시 경고 + 대안 1건(가능 범위)
- [ ] (AC-E4) 위험 셀 완전 회피 라우팅은 옵션 (MVP는 통과 표시까지)
- [ ] **fallback 좌표·단위 (P6)**: Mobility 미발급 시 fallback: (a) 도보 = haversine 거리(m, 소수점 0자리), Polyline 흰색 stroke 4px, 시작/끝 marker, (b) 차량 = mode toggle만 노출 + "키 발급 시 가능" 비활성 안내, (c) HIGH 셀 통과 검출 = `ST_Intersects(LineString(직선), risk_cell.geom)`로 fallback에서도 동일 SQL 호출 가능 — 경고 박스 표시 일관.

**파일 트리**
```
apps/web/app/(public)/route/page.tsx
apps/web/components/
├── RouteForm.tsx
└── RoutePolylineLayer.tsx

apps/web/app/api/route/
├── search/route.ts                  (도보·차량)
└── intersect-high/route.ts          (LineString ↔ HIGH 셀 ST_Intersects)
```

**핵심 라이브러리·외부 API**: Kakao Local, Kakao Mobility (일일 5K Free, P6 시작 시 신청). PostGIS `ST_Intersects`.

**검증 방법**: 수동 smoke (송파→광진 경로, HIGH 셀 통과 시 경고).

**예상 소요**: 1.5~2주

**차단 가능 위험**: Kakao Mobility 키 지연 → 도보는 직선+거리 fallback, 차량은 mode toggle만.

---

### Phase 7 — 운영자 콘솔 + 헬스 (1~1.5주, 누적 14.5~17.5주)

**목표**: `/admin` ENV 비밀번호 인증 + Top 20 + 최근 제보 50 + API 헬스.

**체크리스트**
- [ ] (AC-G1) 단일 비밀번호 인증
- [ ] (AC-G2) Top 20 위험 셀 표
- [ ] (AC-G3) 최근 제보 50건 표
- [ ] (AC-G4) API 헬스 (소스별 last_success_at + 1h failure_count, **TOPIS degradation 표시 포함**)
- [ ] (AC-G5) 경보 정책·외부 발송 트리거 **없음** (Non-Goal 가드)

**파일 트리**
```
apps/web/app/admin/
├── layout.tsx (auth gate)
├── page.tsx
└── login/page.tsx

apps/web/app/api/admin/
├── login/route.ts                   (비밀번호 → signed cookie)
├── top20/route.ts
├── reports/route.ts
└── health/route.ts

apps/web/lib/admin-auth.ts
```

**핵심 라이브러리·외부 API**: `iron-session` 또는 `jose` HMAC cookie. shadcn/ui Table.

**검증 방법**: 수동 smoke. 비번 틀림 → 401, 정상 → 3개 표 + 5초 polling.

**예상 소요**: 1~1.5주

**차단 가능 위험**: 운영자 콘솔에 기능 추가 유혹 → spec G5와 본 plan Non-Goal 가드로 차단.

---

### Phase 8 — 배포·시연 자산·README + 옵션 항목 (1주, 누적 15.5~18.5주, 상한 17주에서 옵션 항목 가산점)

**목표**: 외부 도메인 또는 Vercel preview, 시연 GIF·다이어그램·README 완성. **Playwright e2e와 replay smoke는 옵션 가산점**.

**체크리스트**
- [ ] (AC-A1) 외부 URL 누구나 접속
- [ ] (AC-A3) README 완성: 환경변수, 로컬 실행, 배포, 외부 API 키 발급 절차, 룰베이스 공식·가중치, GitHub Actions cron 셋업
- [ ] **README "Security" 섹션 (C-1)**: secret 생성 `openssl rand -hex 32`. INGEST_TOKEN/ADMIN_PASSWORD/SESSION_SECRET/IP_SALT 4개 모두 시연 직전 1회 회전. `.env*`는 `.gitignore` 검사. Supabase RLS 정책. Kakao 도메인 화이트리스트 항목 정리.
- [ ] **README "디버깅" 섹션 (Nice-to-have)**: 다음 위치 3줄 — (1) Vercel Logs: Vercel 대시보드 > 프로젝트 > Logs 탭 (7일 보존), (2) GitHub Actions cron: GitHub 레포 > Actions 탭 > "Ingest All" workflow, (3) Supabase logs: Supabase 대시보드 > Project > Logs > Postgres/Edge.
- [ ] (AC-H1) 시스템 다이어그램 1개 + 시연 GIF 1개 — **다이어그램 합격 임계**: 박스 6개(시민 클라 / Next.js 서버 / GitHub Actions cron / Supabase Postgres+Storage / 외부 API 5종 / Kakao Maps) + 화살표 5개(클라→Next.js, GH cron→Next.js→외부 API, 외부 API→Supabase, Next.js→Kakao Maps, 클라→Supabase Storage signed URL). PNG 또는 mermaid.
- [ ] (AC-H2 옵션) 1~2개 호우 사례 replay 모드 — `risk_score_archive` 테이블에 fixture 적재 + time slider. 검증을 "현재 시각 데이터 시각 확인"으로 대체 가능. archive INSERT 데이터 출처는 P8 진입 시점에 결정 (ADR-008): (a) `packages/risk/__tests__/scenarios.test.ts` 형식의 mock fixture 적재, 또는 (b) production `risk_score_current` 임의 시점 `pg_dump` 후 INSERT.
- [ ] (옵션) Playwright e2e 1~2 시나리오 (시민 흐름, 제보 흐름)

**파일 트리**
```
README.md (완성본)
docs/
├── architecture.svg (또는 mermaid)
├── data-flow.svg
└── demo.gif

apps/web/app/(public)/replay/page.tsx (옵션, time slider)
scripts/replay-seed.ts (옵션)

e2e/ (옵션, Playwright)
├── citizen.spec.ts
└── report.spec.ts
```

**검증 방법**: 시연 영상 30초에 시민 흐름 + 제보 흐름. README 따라 새 머신 0→배포 1시간 안.

**예상 소요**: 1주 (옵션 항목 미포함). replay + Playwright 모두 시도 시 +1주.

**차단 가능 위험**: 옵션 욕심으로 일정 초과 → 옵션은 마지막 1주에만, 안 되면 mock·수동 smoke로 대체.

---

**누적 합계**: P0(1) + P1(3.5~4) + P2(2) + P3(3~4) + P4(1.5) + P5(1~1.5) + P6(1.5~2) + P7(1~1.5) + P8(1, 옵션 +1) = **14.5~17.5주**. spec 추정 11~17주의 상한 안. 14주 하단은 옵션 모두 생략 + Phase 1·3에 운이 따른 경우. 11주 하단 폐기.

---

## 3. 데이터 모델 v2 (PostGIS 스키마 — `risk_score_current` upsert + 옵션 archive)

> SRID 4326 저장. 거리 계산은 `geography` 캐스팅 또는 5186 변환 후 미터.

```sql
-- ========== 정적 공간 데이터 ==========
CREATE TABLE gu_boundary (
  gu_code        TEXT PRIMARY KEY,
  gu_name        TEXT NOT NULL UNIQUE,
  geom           geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX idx_gu_boundary_geom ON gu_boundary USING GIST (geom);

CREATE TABLE risk_cell (
  cell_id        TEXT PRIMARY KEY,
  geom           geometry(Polygon, 4326) NOT NULL,
  centroid       geometry(Point, 4326) NOT NULL,
  gu_code        TEXT REFERENCES gu_boundary(gu_code),
  area_m2        DOUBLE PRECISION
);
CREATE INDEX idx_risk_cell_geom     ON risk_cell USING GIST (geom);
CREATE INDEX idx_risk_cell_centroid ON risk_cell USING GIST (centroid);
CREATE INDEX idx_risk_cell_gu       ON risk_cell (gu_code);

CREATE TABLE shelter (
  shelter_id     TEXT PRIMARY KEY,
  name           TEXT,
  geom           geometry(Point, 4326) NOT NULL,
  kind           TEXT,
  capacity       INTEGER,
  gu_code        TEXT REFERENCES gu_boundary(gu_code)
);
CREATE INDEX idx_shelter_geom ON shelter USING GIST (geom);

CREATE TABLE pump_station (
  pump_id        TEXT PRIMARY KEY,
  name           TEXT,
  geom           geometry(Point, 4326) NOT NULL,
  gu_code        TEXT REFERENCES gu_boundary(gu_code)
);
CREATE INDEX idx_pump_geom ON pump_station USING GIST (geom);

CREATE TABLE flood_forecast_polygon (
  id             SERIAL PRIMARY KEY,
  geom           geometry(MultiPolygon, 4326) NOT NULL,
  return_period  INTEGER,
  depth_class    TEXT
);
CREATE INDEX idx_flood_forecast_geom ON flood_forecast_polygon USING GIST (geom);

-- ========== 시계열: 외부 관측 (72시간 보존) ==========
CREATE TABLE kma_grid_obs (
  id           BIGSERIAL PRIMARY KEY,
  nx           INTEGER NOT NULL,
  ny           INTEGER NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lon          DOUBLE PRECISION NOT NULL,
  valid_at     TIMESTAMPTZ NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fields       JSONB NOT NULL,
  UNIQUE (nx, ny, valid_at)
);
CREATE INDEX idx_kma_obs_valid      ON kma_grid_obs (valid_at DESC);
CREATE INDEX idx_kma_obs_grid_valid ON kma_grid_obs (nx, ny, valid_at DESC);

CREATE TABLE river_stage (
  id               BIGSERIAL PRIMARY KEY,
  station_id       TEXT NOT NULL,
  station_name     TEXT,
  geom             geometry(Point, 4326),
  ts               TIMESTAMPTZ NOT NULL,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_m          DOUBLE PRECISION,
  threshold_warn   DOUBLE PRECISION,
  threshold_severe DOUBLE PRECISION,
  UNIQUE (station_id, ts)
);
CREATE INDEX idx_river_stage_ts   ON river_stage (station_id, ts DESC);
CREATE INDEX idx_river_stage_geom ON river_stage USING GIST (geom);

CREATE TABLE drainpipe_stage (
  id          BIGSERIAL PRIMARY KEY,
  sensor_id   TEXT NOT NULL,
  geom        geometry(Point, 4326),
  ts          TIMESTAMPTZ NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage       DOUBLE PRECISION,
  UNIQUE (sensor_id, ts)
);
CREATE INDEX idx_drainpipe_ts   ON drainpipe_stage (sensor_id, ts DESC);
CREATE INDEX idx_drainpipe_geom ON drainpipe_stage USING GIST (geom);

CREATE TABLE topis_event (
  event_id      TEXT PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom          geometry(Point, 4326),
  kind          TEXT,
  severity      TEXT,
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_topis_geom   ON topis_event USING GIST (geom);
CREATE INDEX idx_topis_active ON topis_event (is_active, ts DESC);

-- ========== 위험점수 (디폴트: current upsert, 일일 row 9,700) ==========
CREATE TABLE risk_score_current (
  cell_id     TEXT PRIMARY KEY REFERENCES risk_cell(cell_id),
  valid_at    TIMESTAMPTZ NOT NULL,
  score       DOUBLE PRECISION NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('SAFE','LOW','MED','HIGH')),
  inputs      JSONB NOT NULL
);
CREATE INDEX idx_risk_current_level    ON risk_score_current (level);
CREATE INDEX idx_risk_current_valid_at ON risk_score_current (valid_at DESC);

-- ========== 위험점수 archive (옵션, P8 호우일 fixture 한정) ==========
CREATE TABLE risk_score_archive (
  id          BIGSERIAL PRIMARY KEY,
  scenario_id TEXT NOT NULL,                -- 'replay-2022-08-08'
  cell_id     TEXT NOT NULL REFERENCES risk_cell(cell_id),
  valid_at    TIMESTAMPTZ NOT NULL,
  score       DOUBLE PRECISION NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('SAFE','LOW','MED','HIGH')),
  inputs      JSONB NOT NULL,
  UNIQUE (scenario_id, cell_id, valid_at)
);
CREATE INDEX idx_risk_archive_scenario_valid ON risk_score_archive (scenario_id, valid_at DESC);

-- ========== 시민 제보 ==========
CREATE TABLE citizen_report (
  id              BIGSERIAL PRIMARY KEY,
  geom            geometry(Point, 4326) NOT NULL,
  gu_code         TEXT REFERENCES gu_boundary(gu_code),
  depth_step      TEXT NOT NULL CHECK (depth_step IN ('ankle','knee','thigh','above')),
  mobility_block  TEXT[] NOT NULL DEFAULT '{}',
  note            TEXT,
  photo_url       TEXT,                            -- Supabase Storage signed URL 또는 public path
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash         TEXT NOT NULL                     -- sha256(ip + IP_SALT)
);
CREATE INDEX idx_report_created         ON citizen_report (created_at DESC);
CREATE INDEX idx_report_geom            ON citizen_report USING GIST (geom);
CREATE INDEX idx_report_gu_created      ON citizen_report (gu_code, created_at DESC);
CREATE INDEX idx_report_iphash_created  ON citizen_report (ip_hash, created_at DESC);

-- ========== 데이터 소스 헬스 ==========
CREATE TABLE data_source_health (
  source_name      TEXT PRIMARY KEY,
  last_success_at  TIMESTAMPTZ,
  last_failure_at  TIMESTAMPTZ,
  last_error       TEXT,
  failure_count_1h INTEGER DEFAULT 0
);
```

**v1 대비 변경**: `risk_score_snapshot` 폐기 → `risk_score_current`(셀당 1행 upsert) + `risk_score_archive`(옵션 fixture). 일일 row 1.4M → 9.7K. Supabase Free 500MB 안전.

---

## 4. Cron 설계 (GitHub Actions 1개로 통합 — v2 lock-in)

### 4.1 GitHub Actions cron

| 워크플로우 | Schedule | 호출 endpoint | 책임 |
|---|---|---|---|
| `.github/workflows/ingest.yml` | `*/5 * * * *` | `POST /api/ingest/all` | 5개 어댑터 + risk-recalc 모두 |

### 4.2 Vercel Cron (옵션 1개만)

| Cron Path | Schedule | 책임 |
|---|---|---|
| `/api/cron/cleanup` | `0 19 * * *` (UTC = KST 04:00) | 시계열 테이블 72h 초과 row DELETE |

> Vercel Cron 1개는 Hobby 정책 안에 안전. 또는 `pg_cron` extension으로 DB 안에서 실행 가능 — Phase 1 후반 결정.

### 4.3 `/api/ingest/all` 내부 동작

```ts
// X-Ingest-Token 검증
// 분(min) 기반 분기:
//   매 5분: KMA ncst, TOPIS
//   매 10분 (min % 10 == 0): + river, drainpipe
//   매 60분 (min % 60 == 0): + KMA fcst
// 모두 Promise.allSettled로 실행, 각 어댑터 8s 타임아웃
// 모든 어댑터 success 후 risk.recalc() 단일 SQL upsert 호출
// 결과 data_source_health 갱신
```

런타임 플래그:
```ts
export const runtime = 'nodejs';
export const maxDuration = 60;   // Vercel Hobby 60s
```

---

## 5. API 라우트 계약 v2 (zoom 분기 추가)

### 5.1 `GET /api/risk/cells?bbox={minLon},{minLat},{maxLon},{maxLat}&ts={ISO?}`

**용도**: zoom ≥ 14 클라이언트 호출.
**제약**: BBox 면적 상한 200km², 응답 셀 ≤ **1,500** cap. 초과 시 `X-Downsample` 헤더 + `recommended_zoom` 필드.

**Auto-aggregated graceful degrade (D-3)**: BBox 면적 > 50km² **또는** 매칭 셀 > 1,500인 요청은 서버가 자동으로 aggregated 응답으로 폴백. 409 거부 옵션은 폐기 — 데모 시연 중 흰 화면 방지. fallback 시 응답 헤더 `X-Auto-Aggregated: true`, body는 `cells: []` 대신 `gus: [...]` 구조 + `auto_aggregated: true` 플래그.

정상 응답 (zoom ≥ 14, BBox 안전):
```json
{
  "ts": "2026-05-06T10:00:00Z",
  "stale_minutes": 3,
  "cell_count": 842,
  "downsampled": false,
  "auto_aggregated": false,
  "cells": [
    {
      "cell_id": "S25-0123-0456",
      "geom": { "type": "Polygon", "coordinates": [[[127.04,37.55],...]] },
      "score": 0.82,
      "level": "HIGH"
    }
  ]
}
```

Auto-aggregated fallback 응답 (헤더 `X-Auto-Aggregated: true`):
```json
{
  "ts": "2026-05-06T10:00:00Z",
  "stale_minutes": 3,
  "auto_aggregated": true,
  "reason": "bbox_area_over_50km2",
  "gus": [
    {
      "gu_code": "11680",
      "gu_name": "강남구",
      "avg_score": 0.42,
      "max_score": 0.78,
      "max_level": "HIGH",
      "cell_count": 412,
      "geom": { "type": "MultiPolygon", "coordinates": [...] }
    }
  ]
}
```

### 5.2 `GET /api/risk/aggregated?bbox=...&level=gu&ts=...`

**용도**: zoom < 14 호출. 자치구 25개 단위 집계.

응답:
```json
{
  "ts": "2026-05-06T10:00:00Z",
  "stale_minutes": 3,
  "gus": [
    {
      "gu_code": "11680",
      "gu_name": "강남구",
      "avg_score": 0.42,
      "max_score": 0.78,
      "max_level": "HIGH",
      "cell_count": 412,
      "geom": { "type": "MultiPolygon", "coordinates": [...] }
    }
  ]
}
```

### 5.3 `GET /api/layers/shelters?bbox=...`

```json
{ "shelters": [ { "shelter_id": "...", "name": "...", "lat": 37.5, "lon": 127.0, "kind": "수해대피소", "capacity": 200 } ] }
```

### 5.4 `GET /api/layers/pumps?bbox=...`

```json
{ "pumps": [ { "pump_id": "...", "name": "...", "lat": 37.5, "lon": 127.0 } ] }
```

### 5.5 `GET /api/layers/road-events?bbox=...&active=true`

```json
{ "events": [ { "event_id": "...", "ts": "...", "lat": ..., "lon": ..., "kind": "통제", "severity": "high", "description": "..." } ] }
```

### 5.6 `POST /api/reports`

요청:
```json
{
  "lat": 37.55,
  "lon": 127.04,
  "depth_step": "knee",
  "mobility_block": ["walk", "stroller"],
  "note": "도로가 잠겨 있어요",
  "photo_token": "supabase_storage_path_or_null"
}
```
응답 201:
```json
{ "id": 12345, "gu_code": "11680", "created_at": "..." }
```
응답 429:
```json
{ "error": "RATE_LIMITED", "retry_after_seconds": 35 }
```

### 5.7 `GET /api/admin/top20`

```json
{
  "ts": "2026-05-06T10:00:00Z",
  "cells": [
    { "cell_id": "S25-0123-0456", "score": 0.91, "level": "HIGH", "gu_name": "강남구", "valid_at": "..." }
  ]
}
```

### 5.8 `GET /api/admin/health`

```json
{
  "sources": [
    { "name": "kma_ncst",     "last_success_at": "...", "failure_count_1h": 0 },
    { "name": "kma_fcst",     "last_success_at": "...", "failure_count_1h": 0 },
    { "name": "seoul_river",  "last_success_at": "...", "failure_count_1h": 2 },
    { "name": "seoul_drain",  "last_success_at": "...", "failure_count_1h": 0 },
    { "name": "topis",        "last_success_at": "...", "failure_count_1h": 0, "degradation": false },
    { "name": "risk_recalc",  "last_success_at": "...", "failure_count_1h": 0 }
  ]
}
```

### 5.9 `POST /api/ingest/all` (내부, X-Ingest-Token 필수)

응답:
```json
{
  "ran_at": "...",
  "duration_ms": 12450,
  "results": [
    { "source": "kma_ncst",    "ok": true,  "rows_inserted": 200 },
    { "source": "topis",       "ok": false, "error": "401 Unauthorized" },
    { "source": "risk_recalc", "ok": true,  "rows_upserted": 9683 }
  ]
}
```

---

## 6. 룰베이스 위험도 산정 공식 (초기값, README와 동일)

### 6.1 입력 변수 (5종, 0.0~1.0 정규화)

| 변수 | 정규화 방식 | 비고 |
|---|---|---|
| `R_rain` (강수) | `max(min(rain_60min/50, 1), min(rain_30min/30, 1), min(rain_10min/15, 1))` | KMA HSR/RN1. 단기 강도 max. |
| `R_river` (하천) | `(stage_m - threshold_warn) / (threshold_severe - threshold_warn)` clamp 0~1 | 가장 가까운 1개 관측소. |
| `R_drain` (하수) | `max(rise_30min / 0.5m, stage / pipe_capacity)` clamp 0~1 | 상승속도·포화도 큰 값. |
| `R_overlap` (정적 침수예상도) | 셀 면적 중 깊이 0.5m 이상 polygon 면적 비율 | 0~1 직접. |
| `R_road` (TOPIS 도로 통제) | active 통제·심각 사고가 250m 안: 0.3, severity high: 0.5 | **TOPIS degradation 시 0** (각주 1) |

**각주 1**: TOPIS 키 미발급/지연/장애 시 `R_road = 0`으로 fallback. spec AC-B5의 "수집"은 필수이지만 가중합 영향은 옵션이며, 가중치 0.05로 점수 영향 ≤ 5%.

### 6.2 가중합

```
score = 0.40 * R_rain
      + 0.20 * R_river
      + 0.20 * R_drain
      + 0.15 * R_overlap
      + 0.05 * R_road        ← TOPIS degradation 시 0
score ∈ [0.0, 1.0]
```

### 6.3 등급 임계 (초기값)

| Level | 조건 |
|---|---|
| SAFE | `score < 0.20` |
| LOW  | `0.20 ≤ score < 0.45` |
| MED  | `0.45 ≤ score < 0.70` |
| HIGH | `score ≥ 0.70` |

### 6.4 시나리오 sanity check (P3 unit test)

| 시나리오 | 입력 | 기대 |
|---|---|---|
| 폭우 + 하수 포화 | R_rain=1.0, R_drain=1.0 | 0.60 → MED |
| 폭우 + 하수 + 침수예상도 | 위 + R_overlap=1.0 | 0.75 → HIGH |
| 맑음 | 모두 0 | 0.0 → SAFE |
| 약한 비 + 하천 주의 | R_rain=0.3, R_river=0.5 | 0.22 → LOW |
| TOPIS degradation 폭우 | R_rain=1.0, R_road=0 (정상이면 0.5) | 0.40 → LOW (TOPIS 영향 ≤ 0.025, 등급 변동 거의 없음) |

> 운영 조정: 호우일 fixture로 ±20% 범위에서 임계·가중치 조정.

---

## 7. 검증·테스트 계획 (가벼움 + Architect 권장 G 반영)

### 7.1 어댑터 단위 테스트 (vitest, fixture)
- `packages/ingest/__tests__/`에 5개 어댑터 fixture JSON. 정규화·zod 스키마.

### 7.2 룰베이스 위험도 unit test
- `packages/risk/__tests__/scenarios.test.ts` — 섹션 6.4의 5개 시나리오.

### 7.3 수동 smoke (디폴트 검증 — Playwright 격하)
- **Phase 4·5·6·7 검증**: 모바일 1대(iOS Safari 또는 Android Chrome) + 데스크톱 1회 흐름 확인. 시연 영상으로 캡처 → README/H1에 첨부.
- **Phase 1·3 검증**: 배포 후 1시간/1일 경과 시점에 SQL count 쿼리.

### 7.4 호우일 replay smoke (옵션, P8)
- 검증을 "현재 시각 데이터 시각 확인"으로 대체 가능. 기상자료개방포털 별도 키 신청은 plan에서 제거.
- 옵션 시도 시: `risk_score_archive`에 fixture 적재 + time slider.

### 7.5 Playwright e2e (옵션, P8 가산점)
- 시민 흐름 1개, 제보 흐름 1개. 셋업 1~2일 소요로 일정 위험 → 디폴트 OFF.

---

## 8. 환경변수 · 배포 체크리스트

### 8.1 `.env.local` / `.env.example`

```env
# DB (Supabase)
DATABASE_URL=postgres://...                  # pooled
DIRECT_URL=postgres://...                    # direct (마이그레이션)
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...                # 서버 한정
SUPABASE_ANON_KEY=...                         # 클라이언트(브라우저 업로드용)

# 외부 API
KMA_KEY=...                                  # 공공데이터포털 (Decoding) — 운영키 발급 후 swap
SEOUL_KEY=...
TOPIS_KEY=...                                # 미발급 시 빈 값 → R_road=0 fallback
KAKAO_REST_KEY=...                           # REST(서버)
NEXT_PUBLIC_KAKAO_JS_KEY=...                 # JS(클라이언트, 도메인 화이트리스트 등록)

# 운영자 인증
ADMIN_PASSWORD=...
SESSION_SECRET=...

# Ingest 보호
INGEST_TOKEN=...                             # GH Actions가 X-Ingest-Token으로 송부

# 보안
IP_SALT=...

# 환경
NODE_ENV=development|production
```

> **Secret 회전 정책 (C-1)**: secret 생성 `openssl rand -hex 32`. **INGEST_TOKEN / ADMIN_PASSWORD / SESSION_SECRET / IP_SALT** 4개 모두 시연 직전 1회 회전. `.env*`는 `.gitignore` 검사. README "Security" 섹션 P8에 신설.

### 8.2 GitHub Actions secrets

```
DEPLOY_URL       (예: https://weather.vercel.app)
INGEST_TOKEN     (Vercel env와 동일 값)
```

### 8.3 Vercel env 동기화
- Production / Preview / Development 3환경 모두 등록.
- `NEXT_PUBLIC_*`만 클라이언트 노출.

### 8.4 배포 체크리스트
- [ ] Vercel 프로젝트 + GitHub repo 연결
- [ ] Production(`main`) 브랜치 보호
- [ ] **GitHub Actions cron 활성화** (default branch에서만 schedule 동작)
- [ ] **Vercel cleanup cron 등록** (또는 `pg_cron` 활성화)
- [ ] Custom Domain 또는 Vercel URL 공개
- [ ] HTTPS 강제 (기본)
- [ ] **Kakao 도메인 화이트리스트**: `localhost:3000`, `*.vercel.app`, 시연 도메인
- [ ] Supabase RLS off 또는 service role key로 서버에서만 INSERT
- [ ] iOS Safari 1회 검증

---

## 9. 사용자 확정 항목 — Architect 동의로 추가 결정 없이 v2 진행

| # | 항목 | 권장 | 비고 |
|---|---|---|---|
| 1 | DB·Storage | **Supabase (둘 다)** | ADR-002에 lock-in |
| 2 | 격자 해상도 | **250m, 약 9,700 셀** | 산식 단일화 |
| 3 | 인증 | **익명만 + 운영자 ENV 비밀번호** | — |
| 4 | 시연 데이터 모드 | **라이브만, replay는 P8 옵션** | 검증을 "현재 시각 데이터" 대체 가능 |
| 5 | PWA | **포함하지 않음** | — |
| 6 | 자치구 경계 | **서울 열린데이터광장 SHP(SRID 5186) → GeoJSON(4326) 1회** | — |

---

## 10. Non-Goals 가드 재확인

본 v2 어디에도 다음 항목 미등장:
- AI/ML 학습·추론
- 알림 발송(FCM/SMS/Voice/TTS/CBS)
- 보호자 대시보드, 자동전화
- S-Map 디지털 트윈 3D
- 마이크로서비스 / NestJS+FastAPI 이원화
- K8s, Kafka, Redpanda, NATS, MLflow
- Prometheus/Grafana/Loki/OTel 스택
- CCTV 영상 추론, 시민 제보 사진 ML 분류
- 운영자 워크플로우 깊이(경보정책 조정/현장확인 요청/카메라 피드)

---

## 11. ADR (Architectural Decision Record)

### ADR-001: Next.js fullstack 단일 코드베이스
- **Decision**: Next.js App Router + Drizzle + PostGIS raw SQL.
- **Drivers**: 솔로 budget, 단일 코드베이스, 데모급.
- **Alternatives**: NestJS+FastAPI 이원화, Remix, SvelteKit.
- **Why chosen**: 학생 익숙 스택. 한 레포에 UI·API 통합.
- **Consequences**: 함수 timeout 제약 → ADR-005·006으로 처리.
- **Follow-ups**: 없음 (v1과 동일 유지).

### ADR-002: Supabase Postgres+PostGIS+**Storage** (v2 갱신, v3 TTL lock-in)
- **Decision**: Supabase로 DB·Storage·Auth 모두 통일. 사진 저장소도 Supabase Storage. **signed URL TTL = 1주(7일) lock-in (v3 C-5)**, bucket은 private.
- **Drivers**: PostGIS 기본 활성, vendor 1개, 무료.
- **Alternatives**: Neon + Vercel Blob, Vercel Postgres + Vercel Blob.
- **Why chosen**: secret 1세트, 1GB Free, signed URL로 안전.
- **Consequences**: 무료 plan 7일 무활동 일시정지 → 시연 직전 활성화 확인. signed URL TTL 1주 lock-in으로 시민 제보 마커가 1주 후 깨질 가능성은 데모급 수용. server-side `Content-Length > 1.5MB` 즉시 413 reject로 클라이언트 1MB cap 우회 방어 (v3 C-8).
- **Follow-ups**: v1의 "Phase 5에서 결정" 폐기.

### ADR-003: 정적 GeoJSON 25분할 → DB+BBox API (v2 갱신, ADR-007과 결합)
- **Decision**: 정적 25분할 폐기. 격자는 DB `risk_cell` 보존. 클라이언트는 BBox API로 viewport 안만 fetch.
- **Drivers**: 점수와 합본 송출, zoom 분기.
- **Alternatives**: 정적 25분할(v1 안), PostGIS 동적 격자.
- **Why chosen**: viewport 1~2K 셀 cap으로 모바일 첫 fetch 안전. zoom 14 분기로 outzoom에서 자치구 집계.
- **Consequences**: 첫 fetch 200~500ms 비용. cap 1,500 셀 초과 시 server downsample.
- **Follow-ups**: vector tile은 데모 후 검토.

### ADR-004: 룰베이스 가중합 (v1 유지)
- **Decision**: 5개 입력 정규화 + 가중합 + 4단계.
- **Drivers**: spec Non-Goal(ML 금지), 학생 시간, 데모 명확성.
- **Alternatives**: ML nowcast — Non-Goal로 invalidate.
- **Why chosen**: 룰베이스로 spec C 충족 + 투명성.
- **Consequences**: 절대 정확도 한계. UI에 "데모용 룰베이스" 표기.
- **Follow-ups**: 호우일 fixture로 임계·가중치 ±20% 조정.

### ADR-005 (신설): GitHub Actions cron 1개 통합
- **Decision**: `*/5 * * * *` GitHub Actions → `POST /api/ingest/all` 단일 호출. Vercel Cron은 cleanup 1개만.
- **Drivers**: Vercel Hobby cron 정책 미검증, secret 1세트, 디버깅 단순.
- **Alternatives**: Vercel Cron 6개(미검증 위험), Edge+사용자 트리거(spec 위반).
- **Why chosen**: 정책 의존 0, 시간제한 6h 여유.
- **Consequences**: principle 1 약 위배(섹션 1.4 정당화). GH Actions schedule 지연(±1~5분) 가능 — spec AC "5~10분"과 부합.
- **Follow-ups**: 운영 부하 시 schedule 분리 또는 Vercel Pro 전환.

### ADR-006 (신설): risk-recalc 단일 SQL upsert (fan-out 폐기)
- **Decision**: `INSERT INTO risk_score_current ... ON CONFLICT (cell_id) DO UPDATE`로 약 9,700 셀 한 번에 처리. `runtime='nodejs'`, `maxDuration=60`.
- **Drivers**: spec AC-C5 "5~10분 주기" 보장, fan-out 250분 갱신 silent violation 제거.
- **Alternatives**: 자치구 25개 fan-out(v1 안 — 폐기), 별도 Worker 서비스(Non-Goal).
- **Why chosen**: PostGIS spatial index와 단일 SQL이 ~5~15s 예상, 60s 안전 마진.
- **Consequences**: 단일 SQL upsert가 Vercel function timeout(60s, `runtime='nodejs'`, `maxDuration=60`) **1회 발생 시 즉시 chunk fallback 활성**. chunk = 자치구 5개 단위 5회 단일 SQL로 분할(`WHERE gu_code IN (...)`). chunk fallback 활성 후에도 재발 시 `admin/health`에 alert (수동 모니터링). 시계열은 current 1세대만 — replay는 archive 옵션.
- **Follow-ups**: chunk fallback 활성화 이후 재발 모니터링.

### ADR-007 (신설): 격자 송출 모델 — DB+BBox API + zoom 14 분기
- **Decision**: zoom ≥ 14 → `/api/risk/cells` (셀 폴리곤), zoom < 14 → `/api/risk/aggregated?level=gu` (자치구 집계). 응답 cap 1,500 셀.
- **Drivers**: 모바일 첫 fetch, spec AC-D4 "또는"을 "둘 다(분기)"로 명문화.
- **Alternatives**: 정적 GeoJSON 25분할(폐기), vector tile(데모 후).
- **Why chosen**: 페이로드 ≤ 1.5MB, server-side 권한·필터 통합.
- **Consequences**: cap 초과 BBox는 downsample 또는 zoom 권장 응답. 클라이언트 zoom 분기 로직 필요. **서버 측 안전망 (v3 D-3)**: `/api/risk/cells`는 BBox 면적 > 50km² **또는** 매칭 셀 > 1,500 인 요청을 받으면 자동으로 aggregated 응답으로 폴백하고 `X-Auto-Aggregated: true` 헤더 + 응답 body의 `cells: []` 대신 `gus: [...]` 구조 + `auto_aggregated: true` 플래그 반환. 클라이언트가 zoom 13에서 실수로 `/api/risk/cells`를 호출해도 OOM 없이 자치구 응답으로 graceful degrade. 409 거부 옵션은 폐기 — 데모 시연 중 흰 화면 방지.
- **Follow-ups**: vector tile 후속 검토.

### ADR-008 (신설): 시계열 보존 72시간 + archive 분리 (v3 D-2 갱신)
- **Decision**: 외부 관측 시계열(kma/river/drainpipe/topis)은 72시간 보존, 일일 cleanup으로 삭제. `risk_score_current`는 셀당 1행 upsert. 옵션 `risk_score_archive`는 P8 호우일 fixture 한정. **archive INSERT 트리거·데이터 출처는 P8 진입 시점에 결정 (옵션). 지금은 `risk_score_archive` 테이블 스키마와 `scripts/replay-seed.ts` 골격만 준비. P8 후보: (a) `packages/risk/__tests__/scenarios.test.ts` 형식의 mock fixture 적재, 또는 (b) production `risk_score_current` 임의 시점 `pg_dump` 후 INSERT. production cron의 dual-write 없음.**
- **Drivers**: Supabase Free 500MB, 일일 row 1.4M → 9.7K 격하, AC-B7 "보존" 정의 명시.
- **Alternatives**: 무한 보존(부풀림), TimescaleDB 도입(Non-Goal), production dual-write(P3 단일 SQL upsert 복잡도 증가로 폐기).
- **Why chosen**: 데모급 24~72시간 trace 충분. archive는 replay 시연 시만. dual-write 없음으로 P3 단순도 유지.
- **Consequences**: 룰 가중치 튜닝 시 72h 안 데이터로 회고. archive는 옵션 가산점. P8 진입 시 mock vs pg_dump 둘 중 하나 결정 — plan v3에서는 lock-in하지 않음.
- **Follow-ups**: cleanup은 Vercel Cron 1개 또는 `pg_cron` — Phase 1 후반 결정. archive 출처는 P8 진입 시 결정.

---

## 12. spec Acceptance Criteria → Phase 매핑 표 v2

| # | AC (요약) | 책임 Phase | 비고 (v2 변경) |
|---|---|---|---|
| A1 | 외부 URL 접속 | P0+P8 | — |
| A2 | HTTPS | P0 | — |
| A3 | README | P0(skel)→P8(완성) | GH Actions cron 셋업·룰 공식 추가 |
| B1 | KMA ncst 5~10분 | P1 | `/api/ingest/all` 매 5분 |
| B2 | KMA fcst 1시간 | P1 | min%60==0 분기 |
| B3 | 서울 하천 10분 | P1 | min%10==0 |
| B4 | 서울 하수 10분 | P1 | min%10==0 |
| B5 | TOPIS 5~10분 | P1 | **degradation tier**(R_road=0 fallback) |
| B6 | 정적 1회 적재 | P2 | seed scripts |
| B7 | 시계열 보존 | P1+ADR-008 | **72시간 + 일일 cleanup 정의 명시** |
| B8 | 실패+UI 마지막 성공시각 | P1+P2+P7 | **`StaleBanner.tsx` 추가** |
| C1 | 250m 격자 | P3 | **약 9,700 셀** |
| C2 | 5개 입력 결합 점수 | P3 | TOPIS 0 fallback 포함 |
| C3 | 4단계 색상 | P3 | — |
| C4 | 공식·가중치 명시 | P3+P8 | 섹션 6 그대로 |
| C5 | **5~10분 주기** | P3+ADR-006 | **단일 SQL upsert(current, ADR-006)로 5~10분 보장. "시계열 보존" 의미는 ADR-008로 분리 — 외부 관측 72h cleanup + 호우일 archive(P8 옵션). fan-out 폐기.** |
| D1 | Kakao Map 서울 전역 | P2 | — |
| D2 | 위험 셀 컬러 | P3 | — |
| D3 | 6~7개 레이어 토글 | P2+P3+P5 | 자치구 집계 토글 추가 |
| D4 | **줌별 분기** | P3+ADR-007 | **zoom 14 분기 명문화** |
| D5 | 위치 권한 → 카드 | P4 | — |
| D6 | 등급별 한국어 문구 | P4 | — |
| D7 | 가까운 대피소 거리·경로 | P4(거리)+P6(경로) | — |
| E1 | 주소→좌표 | P6 | — |
| E2 | 도보·차량 경로 | P6 | Mobility 미발급 시 직선 fallback |
| E3 | HIGH 통과 경고+대안 | P6 | — |
| E4 | 회피 라우팅 옵션 | P6 | — |
| F1 | 익명 또는 Kakao | P5 | 익명만 권장 |
| F2 | 좌표·물높이·통행불가·메모·사진 | P5 | **Supabase Storage** |
| F3 | 즉시 자기 마커 | P5 | — |
| F4 | 자치구 노출 | P5+P7 | — |
| F5 | IP rate limit | P5 | — |
| G1 | `/admin` 비번 | P7 | — |
| G2 | Top 20 | P7 | — |
| G3 | 제보 50 | P7 | — |
| G4 | API 헬스 | P7 | TOPIS degradation 표시 포함 |
| G5 | 외부 발송 트리거 **없음** | (전체) | Non-Goal 가드 |
| H1 | 다이어그램+GIF | P8 | — |
| H2 | replay (옵션) | P8 | **검증 "현재 시각 데이터" 대체 가능, 별도 키 신청 제거** |

---

## 13. 모호도 잔여

v1의 5개 open question은 v2에서 모두 해소:
- Q1 TOPIS → degradation tier (가중치 표 각주)
- Q2 Kakao Mobility → 직선+거리 fallback (v3 P6 fallback 좌표·단위 lock-in)
- Q3 Vercel Hobby cron → ADR-005 GH Actions로 우회
- Q4 격자 송출 → ADR-007 DB+BBox+zoom 분기 (v3 D-3 auto-aggregated graceful degrade)
- Q5 사진 저장소 → ADR-002 Supabase Storage lock-in (v3 C-5 TTL 1주 + C-8 413 가드 lock-in)

v3 신규 잔여: archive 데이터 출처(mock vs pg_dump)는 P8 진입 시 결정으로 의도적 deferral (ADR-008 D-2). 지금은 스키마와 `scripts/replay-seed.ts` 골격만 준비.

`open-questions.md`는 "v2에서 모두 해소 + v3에서 추가 lock-in"로 갱신 권장.

---

## 14. 모드 표기

- RALPLAN mode: SHORT
- `--deliberate` 비적용. v1 → v2 (Architect) → v3 (Architect 신규 + Critic + Nice-to-have 12 patch 통합) 완료.

---

Plan v3 complete. All ralplan + deep-interview residual decisions locked in.
