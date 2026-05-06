# Architect Review v1 — Seoul Flood Demo Plan

- Reviewer role: Architect (ralplan consensus)
- Source plan: `.omc/plans/seoul-flood-demo-plan.md`
- Source spec: `.omc/specs/deep-interview-seoul-flood-demo.md`
- Open questions: `.omc/plans/open-questions.md`
- Mode: SHORT (deliberate 미적용)
- Generated: 2026-05-06
- Verdict: **NEEDS_PLANNER_REVISION**

---

## A. Steelman Antithesis

### A-1. "9,680 셀 + 5~10분 cron + Postgres 시계열 보존"은 솔로 데모급에 over-engineering

- 셀 산식 모순: 605km² ÷ (0.25km)² = **9,680**. plan은 "약 9.7만"과 "약 10만"을 혼용 (2자릿수 차이).
- `risk_score_snapshot` 적재량: 9,680 × 6/h × 24h = **1,393,920 row/일**.
- Supabase Free tier 500MB 한도 내 시계열 영구 보존 비현실.
- spec AC-C5의 "시계열 보존"은 옵션 가산점인 replay에만 의미. 필수 기능엔 "최신 1세대"만 있으면 충분.

**대안 골자**: `risk_score_snapshot` → `risk_score_current` (셀당 1행 upsert) + `risk_score_archive` (옵션 호우일만 적재).

### A-2. "Vercel Cron 6개"는 Hobby tier 제약 미검증으로 silent contradiction 포함

- Plan은 "Hobby에서 가능 — 정책 확인 필요" 상태로 6개 cron 등록 가정.
- fan-out 디자인("1회 호출에서 1개 자치구만 갱신"): 한 자치구는 250분마다 갱신 → spec AC-C5 "5~10분 주기" **silently violation**.

**핵심**: cron 결정과 fan-out 결정 둘 다 미해결인 채 양립 가정. ralplan 통과 불가 수준 결함.

---

## B. Real Tradeoff Tensions

### Tension 1. 데이터 신선도 ↔ Vercel 비용·timeout

| 축 | 5분 cron 6개 | 10분 cron 또는 fan-out |
|---|---|---|
| spec 부합 | AC-C5 빠른 끝 | AC-C5 느린 끝 |
| Vercel Hobby 호출 한도 | 빠듯 (월 30K+) | 여유 (월 15K) |
| risk-recalc 10초 timeout | 9,680 셀 위험 | 자치구 분할 시 안전 |
| 시연 임팩트 | 라이브 강함 | "마지막 N분 전" 표시로 완화 |

**해소**: 외부 어댑터 5개는 5~10분, **risk-recalc만 10분 + 단일 SQL upsert**. fan-out 폐기.

### Tension 2. 셀 정확도 ↔ 모바일 초기 로드

| 축 | 250m × 9,680 | 500m × 2,420 | h3 res 9 (~150m, 27K) |
|---|---|---|---|
| 시각 차별 | 자치구보다 명확 | 사이 | 가장 자연스러움 |
| GeoJSON 합 | 30~50MB | 8~12MB | 80~120MB |
| 모바일 BBox fetch | 1~3MB | 0.3~1MB | 2~5MB |
| Kakao Maps SDK | polygon 수천 | 수백 | 수만 |

**해소**: 250m 유지 + **viewport BBox 안 1~2K 셀만 GET**. 정적 25분할 GeoJSON 폐기.

### Tension 3. 학습 가치 ↔ 일정 리스크

| 축 | PostGIS 풀스택 | JSON+메모리 |
|---|---|---|
| 학습 가치 | 최상 | 낮음 |
| Phase 3 위험 | 격자 클립·SRID + cron timeout | 거의 없음 |
| 데모 임팩트 | "PostGIS 사용" 가산 | 동일 |

**해소**: PostGIS 유지 + Phase 3에 1주 디버깅 버퍼. 11주 하단 폐기 → **14~17주**.

---

## C. Synthesis (절충 5점)

1. Cron 6개 → **GitHub Actions cron 1개**(5분 트리거 → `/api/ingest/all` 단일 호출).
2. risk-recalc fan-out 폐기 → **단일 SQL upsert** (`INSERT ... ON CONFLICT DO UPDATE`).
3. `risk_score_snapshot` 격하 → `risk_score_current` (upsert) + 옵션 archive 분리.
4. 격자 정적 25분할 폐기 → **DB+BBox API**, zoom < 14는 자치구 집계 응답 분기.
5. Supabase Free 유지, 시연 직전 1주만 Pro 결제 권고(부하 마진).

---

## D. Principle Violations

| Principle | 위배 | 위치 |
|---|---|---|
| 1. 단일 코드베이스 | 약 (GitHub Actions = 외부) | 결정 3 보조 — v2에서 명시적 정당화 필요 |
| 2. 외부 인프라 최소 | 없음 | — |
| 3. 외부 API 실패 시 UI 살아남 | 부분 | 시민 화면 stale 배너 컴포넌트 미명세 |
| 4. 신선도 표시 우선 | 부분 | API에 `stale_minutes` 있으나 UI 약속 없음 |
| 5. 검증 가능한 AC만 | 가벼움 | "39개" vs spec 합의 17개 카운트 충돌 |

---

## E. Section-by-Section Issues

### E-1. 0.3 결정 3 (Vercel Cron) — 가장 큰 미해결
- **Issue**: "Hobby에서 가능 — 정책 확인 필요" 가정으로 plan 진행.
- **Why**: Phase 1(누적 4주차)에서 처음 발견하면 결정 비용 큼.
- **Fix**: GitHub Actions cron 1개로 통합 lock-in. Vercel Cron 0개. (대안: Vercel Cron 1개 + 내부 fan-out)
- **권장**: GitHub Actions cron 1개.

### E-2. 0.3 결정 2 + 섹션 3 (격자·fan-out)
- **Issue**: "정적 GeoJSON 25분할" + "fan-out 1회 1자치구" silently 모순. 한 자치구 250분 갱신 = AC-C5 violation.
- **Fix**: fan-out 폐기. 단일 SQL upsert. `runtime='nodejs'` + `maxDuration=60` (Hobby 60s 가능).

### E-3. Phase 0 — KMA 운영 키 발급 버퍼
- **Issue**: 일반 인증키는 한도 1K~10K/일. 5분 cron = 288/일 + 디버깅 재시도 시 소진 가능.
- **Fix**: Phase 0 첫날 **운영 계정 동시 신청** (1~5영업일).

### E-4. 섹션 4 API 라우트 — 응답 페이로드 크기
- **Issue**: zoom out 상태에서 9,680 셀 한 번 요청 위험.
- **Fix**: API 분기:
  - zoom ≥ 14: `/api/risk/cells?bbox=...` (셀 폴리곤)
  - zoom < 14: `/api/risk/aggregated?bbox=...&level=gu` (자치구 집계)

### E-5. 섹션 2 — `kma_grid_obs` 보존 정책 부재
- **Issue**: 무한 보존 → 한 달 후 부풀림.
- **Fix**: **72시간 보존** + 일일 cleanup cron (`0 4 * * *`) 또는 `pg_cron`.

### E-6. 섹션 7.3 — Kakao 도메인 화이트리스트 누락
- **Issue**: Vercel preview URL 빌드마다 변경 → 지도 안 뜸.
- **Fix**: Phase 0 체크리스트에 추가 — `localhost:3000`, `*.vercel.app`, 시연 도메인 등록. JS키/REST키 분리.

### E-7. 섹션 6.4 — Playwright e2e 비용 vs 가치
- **Issue**: 학생 데모급에 Playwright 셋업 자체가 1~2일.
- **Fix**: 수동 smoke + 시연 영상으로 격하. Playwright는 Phase 8 옵션.

### E-8. 섹션 6.3 — 호우일 replay 데이터
- **Issue**: 기상자료개방포털 별도 키 필요.
- **Fix**: replay 자체를 옵션으로 완전 격하. 검증을 "현재 시각 데이터 시각 확인"으로.

### E-9. Principle 4 ↔ UI 누락
- **Fix**: Phase 2 체크리스트에 `StaleBanner.tsx` 추가 — 5분 초과 노랑, 30분 초과 빨강.

### E-10. 셀 산식 모순 (9,680 vs ~10만)
- **Fix**: plan 첫 페이지에서 "**약 9,700 셀(서울 605km² ÷ 0.25km × 0.25km)**"로 단일화.

---

## F. Open Questions에 대한 의견

| Q | Architect 의견 |
|---|---|
| Q1 TOPIS | **degradation tier**로 격하. 미발급 시 R_road=0 fallback. AC-B5 "수집"만, 룰 영향 옵션. |
| Q2 Kakao Mobility | 일일 5K 안전. Phase 6 시작 시 키 신청 + 미발급시 직선+거리 fallback. |
| Q3 Vercel Hobby cron | E-1 결론대로 GitHub Actions cron 1개로 통합. |
| Q4 격자 송출 | DB+BBox API로 lock-in (정적 GeoJSON 폐기). zoom 분기. |
| Q5 사진 저장소 | **Supabase Storage**로 v2 lock-in (DB와 통일, 1GB Free). |

---

## G. AC 매핑 누수 점검

spec 17 그룹 AC 기준 검증.

| AC | Phase | 검증 | 비고 |
|---|---|---|---|
| A1~A3 | P0+P8 | OK | — |
| B1~B4 | P1 | OK | — |
| B5 TOPIS | P1 | **부분** | degradation tier 명시 필요 |
| B6 정적 1회 | P2 | OK | — |
| B7 시계열 | P1 | **부분** | 보존 정의 누락 |
| B8 실패+UI | P1+P7 | **부분** | 시민 화면 stale 배너 누락 |
| C1~C4 | P3 | OK | — |
| C5 5~10분 갱신 | P3 | **위험** | fan-out spec 충돌 |
| D1~D3 | P2+P3+P5 | OK | — |
| D4 줌별 분기 | P3 | **부분** | 양자택일 결정 누락 |
| D5~D7 | P4+P6 | OK | — |
| E1~E4 | P6 | OK | — |
| F1~F5 | P5 | OK | — |
| G1~G5 | P7 | OK | Non-Goal 가드 OK |
| H1 | P8 | OK | — |
| H2 replay | P8 | **위험** | 데이터 신청 절차 미명시 |

**Non-Goals 누수**: 없음. plan은 Non-Goals를 잘 지키고 있음.

---

## H. 6개 기본값 동의

| # | 항목 | Planner | Architect |
|---|---|---|---|
| 1 | DB | Supabase | **동의** + Storage도 Supabase |
| 2 | 격자 | 250m | **동의** + 9,700 산식 |
| 3 | 인증 | 익명 + ENV | **동의** |
| 4 | replay | 라이브, replay 옵션 | **동의** + 검증 옵션 격하 |
| 5 | PWA | 미포함 | **동의** |
| 6 | 자치구 SHP→GeoJSON | OK | **동의** SRID 5186 |

→ **사용자 결정 없이 plan v2 진행 가능**.

---

## I. 솔로 11~17주 현실성

| Phase | v1 | Architect | 조정 |
|---|---|---|---|
| P0 | 1주 | 빠듯 (KMA 운영키, Kakao 화이트리스트 추가) | 1주 + 위험 명시 |
| P1 | 3주 | **위험** (cron + 5어댑터) | **3.5~4주** |
| P2 | 2주 | OK | 2주 |
| P3 | 3주 | **최대 위험** (PostGIS+가중합+BBox+zoom분기) | **3~4주** |
| P4 | 1.5주 | OK | 1.5주 |
| P5 | 1.5주 | Playwright 격하시 1주 | 1~1.5주 |
| P6 | 1.5주 | Mobility 키 + intersect | 1.5~2주 |
| P7 | 1.5주 | OK | 1~1.5주 |
| P8 | 1주 (+1) | replay 격하시 1주 | 1주 |

**누계**: **14~17주**. plan v1의 11주 하단 비현실 → 폐기.

---

## J. Verdict: NEEDS_PLANNER_REVISION

### 시급 5개 수정 (Critic 전 lock-in 필수)

1. **Cron 디자인**: GitHub Actions cron 1개로 통합. 6개 가정 폐기.
2. **risk-recalc fan-out 폐기**: 단일 SQL upsert. AC-C5 violation 제거.
3. **격자 ADR-003 수정**: 정적 GeoJSON 25분할 폐기 → DB+BBox API + zoom 분기.
4. **셀 카운트 산식 통일**: 9,700 셀.
5. **`risk_score_snapshot` 격하**: current upsert + 옵션 archive 분리.

### 추가 권장 9개 (Critic 라운드 가능)

- KMA 운영 계정 신청 P0
- Kakao 도메인 화이트리스트 P0
- TOPIS degradation tier
- 시민 화면 `StaleBanner.tsx`
- 데이터 보존 72시간
- Supabase Storage lock-in
- Playwright e2e P8 옵션
- Phase 3 위험 강화, 11주 하단 폐기 → 14~17주
- replay smoke test P8 옵션

Architect review v1 complete. Verdict: NEEDS_PLANNER_REVISION
