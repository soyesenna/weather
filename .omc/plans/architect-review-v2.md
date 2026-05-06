# Architect Review v2 — Seoul Flood Demo Plan

- Reviewer role: Architect (ralplan consensus, round 2)
- Source plan: `.omc/plans/seoul-flood-demo-plan.md` (v2, 1156 lines)
- Source spec: `.omc/specs/deep-interview-seoul-flood-demo.md` (변경 없음)
- Round 1 review: `.omc/plans/architect-review-v1.md`
- Verdict: **READY_FOR_CRITIC**
- Generated: 2026-05-06

---

## TL;DR

v2는 v1 review의 시급 5개 lock-in을 ADR-005~008 + 산식 단일화로 정확히 반영, 추가 권장 9개도 충실. silent regression 0건. 신규 silent issue 3건(모두 1~2줄 패치 수준)은 Critic 라운드에서 함께 처리 가능 → READY_FOR_CRITIC.

## A. 시급 5개 lock-in 검증 — 5/5 OK

1. Cron 디자인: ADR-005 + GitHub Actions cron 1개 + Vercel cleanup cron 1개. 본문 일관 ✓
2. fan-out 폐기: ADR-006 + 단일 SQL upsert + 60s fallback ✓
3. 격자 ADR-007: zoom 14 분기 4계층(섹션 1.3, ADR, API 5.1·5.2, RiskCellLayer/RiskGuLayer) ✓
4. 셀 산식: 9,683 → "약 9,700" 일관, 본문 10회 ✓
5. snapshot 격하: current(upsert) + archive(옵션) ✓

## B. 추가 권장 9개 검증 — 9/9 OK (각 2~5계층 반영)

A. KMA 운영키 P0 ✓ / B. Kakao 화이트리스트 P0 ✓ / C. TOPIS degradation 5계층 ✓ / D. StaleBanner 글로벌 슬롯 ✓ / E. 보존 72h + cleanup ✓ / F. Supabase Storage ✓ / G. Playwright P8 옵션 ✓ / H. 14~17주 + Phase 3 위험 강화 ✓ / I. replay smoke P8 옵션 ✓

## C. silent regression 점검 — 0건

| 폐기 디자인 | 본문 결정 경로 | Alternatives/폐기 노트 |
|---|---|---|
| fan-out | 0회 | ADR-005·006 Alternatives만 |
| Vercel Cron 6개 | 0회 | 결정 표 폐기 옵션 + ADR-005 Alt + Changelog만 |
| 정적 GeoJSON 25분할 | 0회 | ADR-003·007 Alt + Changelog만 |
| risk_score_snapshot | 0회 | 섹션 3 변경 노트 + Changelog만 |

## D. 신규 silent issue 3건

### D-1. AC-C5 매핑 표에서 archive 책임 분리 누락
- **Issue**: AC 매핑 표(line 1109) C5 책임이 ADR-006에만 매핑. 시계열 보존을 archive로 옮긴 ADR-008 언급 없음.
- **Fix (Critic 처리)**: 매핑 표 C5 비고 1줄 보강 — "단일 SQL upsert(current) + 옵션 archive(P8). '시계열 보존' 의미는 ADR-008에서 72h 외부 관측 + 호우일 archive로 정의".

### D-2. archive INSERT 트리거 시점·데이터 출처 미명시
- **Issue**: ADR-008 "archive는 P8 호우일 fixture 한정" 명시되나 INSERT 시점/누가/데이터 출처 모호. KMA 과거 키 신청을 v2에서 제거했으므로 fixture 출처 불명확.
- **Fix (Critic 처리)**: ADR-008 Decision에 1줄 추가 — "archive INSERT는 개발자 로컬 `scripts/replay-seed.ts` 1회 실행. 데이터 출처 = 자체 mock fixture 또는 production current 임의 시점 스냅샷. production cron의 dual-write 없음".

### D-3. zoom 14 분기가 클라이언트 신뢰 단독
- **Issue**: ADR-007 분기는 클라이언트 zoom 값 단독 결정. `/api/risk/cells`는 `bbox`만 받고 `zoom` 미전달. zoom 13에서 실수로 호출 시 9,700 셀 매칭 → cap 1,500 임의 절단.
- **Fix (Critic 처리)**: ADR-007 Consequences에 "서버는 BBox 면적 > 50km² 인 `/api/risk/cells` 요청에 대해 `409 Use /api/risk/aggregated` 응답" 또는 "cap 초과 시 자동 aggregated 응답 + `X-Auto-Aggregated: true` 헤더".

## E. Principle 위배 재점검 — 5/5 충족

1. 단일 코드베이스 — GitHub Actions 정당화 단락(섹션 1.4) + ADR-005 Consequences 명시 ✓
2. 외부 인프라 최소 — principle 2를 "Vercel + Supabase + GitHub Actions 허용"으로 재정의 (Critic 도전 가능)
3. UI 살아남 — StaleBanner 글로벌 ✓
4. 신선도 표시 — 5분/30분 임계 명문 ✓
5. 검증 가능 AC — 17 그룹 / 39 세부 분해 일관 ✓

## F. AC 매핑 v1 부분 위반 5개 — 5/5 OK

B5/B7/B8/C5/D4 모두 v2에서 OK. 단 C5·D4는 D-1·D-3로 미세 보강 필요.

## G. Non-Goals 누수 점검 — 0건

AI/알림/K8s/MLflow/S-Map 등 9개 모두 Alternatives·가드 형태로만 존재. 본문 결정 경로 0회. Phase 7에 "운영자 워크플로우 깊이 유혹 차단" 능동 가드까지 명시.

## H. 일정 현실성 14~17주

v2 신규 작업(StaleBanner, zoom 분기 API, cleanup cron, GH Actions, archive 등) 누계 6~8일 추가. Phase 누계 14.5~17.5주 일치. **P0 1주 빠듯** (KMA 운영키 + Kakao 화이트 + Supabase + 4개 키 발급 + Vercel preview) — Critic이 0.5주 슬라이드 시나리오 강제 권장.

## I. Open Questions — 5/5 [x] 처리, 신규 0

## J. Verdict: READY_FOR_CRITIC

### Critic에게 전달할 신규 발견 (3건, 모두 1~2줄 패치)
1. D-1: AC-C5 매핑 표 비고 archive 명시
2. D-2: ADR-008 archive INSERT 시점·출처 명시
3. D-3: ADR-007 BBox 면적 서버 측 fallback 명시

### Critic에게 함께 도전 권장 (optional 2건)
- P0 1주 빠듯 → 0.5주 슬라이드 시나리오
- Principle 2 재정의 정합성 도전

Architect re-review v2 complete. Verdict: READY_FOR_CRITIC
