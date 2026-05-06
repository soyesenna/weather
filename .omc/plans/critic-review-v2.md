# Critic Review v2 — Seoul Flood Demo Plan

- Reviewer role: Critic (ralplan consensus, final gate)
- Source plan: `.omc/plans/seoul-flood-demo-plan.md` (v2, 1156 lines)
- Source spec: `.omc/specs/deep-interview-seoul-flood-demo.md` (변경 없음, 17 그룹 AC)
- Architect v1: `.omc/plans/architect-review-v1.md`
- Architect v2: `.omc/plans/architect-review-v2.md` (READY_FOR_CRITIC)
- Mode: RALPLAN SHORT (deliberate 미적용)
- Generated: 2026-05-06
- **Verdict: APPROVE (with 13 execution-time patches recommended)**

## TL;DR

Plan v2는 v1 review 시급 5개 + 추가 9개를 충실히 반영, silent contradiction 0건, ADR 완전성 8/8, principle ↔ option 일관성 OK. Architect D-1·D-2·D-3 + Critic 자체 발견 8건 모두 1~2줄 patch 수준 → blocker 0. **APPROVE**, autopilot Phase 2 진입 가능.

## 1. Principle-Option Consistency — 5/5 정합

- Principle 1(단일 코드베이스) 약 위배(GH Actions): 4가지 근거 정당화 (`섹션 1.4`, ADR-005 Consequences). 합리적 예외.
- Principle 2(외부 인프라 최소) 재정의("Vercel + Supabase + GH Actions 허용"): 약화 아닌 honest naming. spec Constraints의 허용 목록과 정합.
- Principle 3(UI 살아남), 4(신선도), 5(검증가능 AC): 모두 정합.

## 2. Alternatives 공정성 — 8/8 ADR OK

ADR-005에 "Vercel Cron 1개 + 내부 fan-out" 옵션 누락은 nice-to-have(이미 fan-out은 ADR-006에서 폐기되었으므로 실질 위협 0).

## 3. Risk Mitigation Clarity — Phase별

- P0~P2, P4, P5(부분), P6(부분), P7, P8: OK
- P3 fallback 임계(60s 초과 발동 조건) 명시 약함 → minor patch
- P1 GH Actions cron 첫 실패 디버깅 위치 약함 → README patch

## 4. Testable AC — 39/39 매핑, 35/39 임계 명확

ambiguous 4건: B1(11분 초과 0건/24h 임계 약함), C5(D-1 patch 적용 후 명확화), D4(D-3 patch 적용 후 명확화), H2(replay 옵션 합격 기준 약함).

## 5. Concrete Verification Steps — 9/9 OK

P4 "수동 smoke" 시나리오 약하나 spec D5/D6/D7가 합격 기준 정의 OK.

## 6. Architect 신규 발견 3건 (D-1·D-2·D-3) — Patch-ready

### D-1 patch (AC-C5 매핑 표 비고)
**위치**: `seoul-flood-demo-plan.md:1109` C5 행
**현재**: `| C5 | **5~10분 주기** | P3+ADR-006 | **fan-out 폐기 → 단일 SQL upsert** |`
**Patch**:
```
| C5 | **5~10분 주기** | P3+ADR-006 | **단일 SQL upsert(current, ADR-006)로 5~10분 보장. "시계열 보존" 의미는 ADR-008로 분리 — 외부 관측 72h cleanup + 호우일 archive(P8 옵션). fan-out 폐기.** |
```

### D-2 patch (ADR-008 archive INSERT 시점·출처)
**위치**: `seoul-flood-demo-plan.md:1081` ADR-008 Decision 끝에 추가
**Patch**:
```
archive INSERT 트리거 = 개발자 로컬 `scripts/replay-seed.ts` 1회 수동 실행. 데이터 출처 = (a) packages/risk/__tests__/scenarios.test.ts mock fixture를 scenario_id='replay-mock-2025'로 적재, 또는 (b) production risk_score_current 임의 시점 스냅샷을 pg_dump 후 archive로 INSERT. production cron의 dual-write 없음.
```

### D-3 patch (ADR-007 BBox 면적 서버 측 fallback) — lock-in: 자동 aggregated
**위치**: `seoul-flood-demo-plan.md:1077` ADR-007 Consequences 끝에 추가
**Patch**:
```
서버 측 안전망: /api/risk/cells는 BBox 면적 > 50km² 또는 매칭 셀 > 1,500 인 요청을 받으면 자동으로 aggregated 응답으로 폴백하고 X-Auto-Aggregated: true 헤더 + 응답 body의 cells: [] 대신 gus: [...] 구조 + auto_aggregated: true 플래그 반환. 클라이언트가 zoom 13에서 실수로 /api/risk/cells를 호출해도 OOM 없이 자치구 응답으로 graceful degrade. 409 거부 옵션은 폐기 — 데모 시연 중 흰 화면 방지.
```

## 7. Architect Optional Challenge 2건 판정

- **P0 1주 빠듯** → 실현 가능. plan v3 강제 X. P0 buffer "1.0~1.25주" 명시는 nice-to-have patch.
- **Principle 2 재정의** → honest naming. APPROVE.

## 8. Non-Goals 가드 일관성

P6/P7 능동 가드 OK. **P5 시민 제보 신뢰도 자동검증 가드 누락** → minor patch.

## 9. Critic 자체 신규 발견 8건

| # | 발견 | 시급 |
|---|---|---|
| C-1 | secret 회전 정책 미명시 (INGEST_TOKEN/ADMIN_PASSWORD/SESSION_SECRET/IP_SALT) | important |
| C-2 | 디버깅 인프라 README 부재 | nice-to-have |
| C-3 | 무료 tier 한도 모니터링 부재 (Supabase 500MB / Vercel 100K / Mobility 5K / KMA) | important |
| C-4 | P6 fallback 좌표/단위/표시 미명시 | nice-to-have |
| C-5 | Supabase Storage signed URL TTL 미명시 (1주 또는 public 버킷) | important |
| C-6 | i18n D6 한국어 문구 spec 합치 — OK 합격 | OK |
| C-7 | rate limit IP-only 우회 가능성 — 데모급 합리 | OK |
| C-8 | photo upload abuse — 서버 측 size 검증 부재 | important |
| C-9 | 단일 SQL upsert atomic 일관성 — OK 합격 | OK |
| C-10 | README 다이어그램 합격 기준 약함 | nice-to-have |

## 10. Patch 통합 표

| # | 위치 | 시급도 |
|---|---|---|
| D-1 | `:1109` AC 매핑 C5 비고 | important |
| D-2 | `:1081` ADR-008 Decision | important |
| D-3 | `:1077` ADR-007 Consequences | important |
| C-1 | `:957-967` 환경변수 표 | important |
| C-3 | `:836-849` admin/health + README tier 표 | important |
| C-5 | `:417` photo-upload signed URL TTL | important |
| C-8 | `:417` server-side photo size 검증 | important |
| P0 buffer | `:104, 149` Phase 0 1.0~1.25주 | nice-to-have |
| P3 fallback 임계 | `:346, 1069` ADR-006 Consequences | nice-to-have |
| P5 Non-Goal 가드 | `:399-405` Phase 5 체크리스트 | nice-to-have |
| C-2 README 디버깅 | README 신설 섹션 | nice-to-have |
| C-4 P6 fallback 단위 | `:438-460` Phase 6 | nice-to-have |
| C-10 다이어그램 임계 | README | nice-to-have |

**Blocker 0 / Important 7 / Nice-to-have 6**

## 11. ADR 완전성 — 8/8 6필드 충족

ADR-001~008 모두 Decision/Drivers/Alternatives/Why/Consequences/Follow-ups 6필드 명시.

## 12. Verdict: APPROVE

### 향후 액션

1. plan v2 그대로 lock-in (본문 보강 없이 다음 단계로)
2. Execution-time patch 13건 — Phase별 적용:
   - **P0 시작 직전**: C-1 (secret 회전), P0 buffer
   - **P1 시작 직전**: C-3 (tier 한도 모니터링)
   - **P3 시작 직전**: D-3 (server-side 자동 aggregated), P3 fallback 임계
   - **P5 시작 직전**: C-5 (signed URL TTL), C-8 (photo size), P5 Non-Goal 가드
   - **P8 시작 직전**: D-1 (매핑 표 보강), D-2 (archive 출처)
   - **README 작성 시**: C-2, C-10, C-4
3. open-questions.md "Critic APPROVE" 1줄 append
4. ralplan SHORT 종료 → autopilot Phase 2 진입

### Ralplan summary row

- Principle/Option Consistency: **Pass**
- Alternatives Depth: **Pass**
- Risk/Verification Rigor: **Pass**
- Deliberate Additions: **N/A** (SHORT 모드)

Critic review v2 complete. Verdict: APPROVE
