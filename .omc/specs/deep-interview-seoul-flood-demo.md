# Deep Interview Spec: 서울 도시침수 대응 데모 웹 (Next.js fullstack)

## Metadata
- Interview ID: `weather-flood-2026-05-06`
- Rounds: 5 + 6 (Round 1~5: 초기 spec, Round 6~11: 잔여 검토 brownfield)
- Final Ambiguity Score: **1.5%** (잔여 19/19 결정 lock-in 완료)
- Type: greenfield → brownfield (v2 단계부터)
- Generated: 2026-05-06
- Last Updated: 2026-05-06 (잔여 검토 완료, ralplan APPROVE → user-final lock-in)
- Threshold: 20%
- Initial Context Summarized: yes (deep-research-report.md, 252 lines → 핵심 요약)
- Status: **FINAL — ALL DECISIONS LOCKED**

## Clarity Breakdown

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.40 | 0.380 |
| Constraint Clarity | 0.80 | 0.30 | 0.240 |
| Success Criteria | 0.92 | 0.30 | 0.276 |
| **Total Clarity** | | | **0.896** |
| **Ambiguity** | | | **0.104 (10.4%)** |

## Goal

서울 25개 자치구 전체를 대상으로 하는 **AI 기반 도시침수 대응 데모 웹 시스템**을 구축한다. KMA·서울시·TOPIS 등 공공 API의 **실데이터**를 5~10분 주기로 수집하고, **룰베이스(임계값+가중합) 위험도 산정**으로 100~250m 셀 단위 위험맵을 그려 배포된 URL에서 작동시킨다. AI 모델 학습과 알림 채널(웹푸시/SMS/음성) 발송은 데모 범위에서 명시적으로 제외한다.

핵심 사용자 흐름은 **시민**용이며, 운영자 콘솔은 "최근 위험 셀 top 20 + 최근 제보 목록" 수준의 단일 페이지로 가볍게 둔다.

## Constraints

- **인력**: 1인 개인 프로젝트 (학생/데모급)
- **시간**: ralplan + 사용자 확정 결과 **14~17주(3.5~4.25개월) 솔로 작업** lock-in (v1의 11주 하단 폐기). Phase 0은 1.0~1.25주 buffer
- **기술 스택**: Next.js fullstack 단일 코드베이스 (TypeScript, App Router 권장)
- **DB**: PostgreSQL + PostGIS extension — **Supabase 관리형 lock-in** (Neon / Vercel Postgres 폐기). TimescaleDB 미사용
- **배포**: Vercel(우선)
- **배경 작업**: **GitHub Actions cron 1개 (5분 트리거 → /api/ingest/all 단일 endpoint) + Vercel Cron 1개(/api/cron/cleanup, 일일 04시) lock-in**. Kafka/Redpanda/NATS 미사용
- **캐시**: 초기에는 Postgres 직접 조회만. Redis 미사용 (필요 시 후속 결정)
- **객체 저장**: **Supabase Storage lock-in** (사진 1MB cap, signed URL TTL 1주, server-side Content-Length > 1.5MB reject)
- **모델**: ML/AI 모델 학습 없음. 룰베이스 임계값 + 가중합 산정만
- **외부 API 비용**: 공공 API(KMA/서울/TOPIS) 무료 쿼터 내, 카카오맵 무료 쿼터 내, 알림 비용 채널 미사용
- **격자**: 약 9,700 셀 (서울 605km² ÷ 0.25km × 0.25km), 4단계 위험도(SAFE/LOW/MED/HIGH)
- **데이터 보존**: 외부 관측 시계열 72시간 + 일일 cleanup. `risk_score_current`는 셀당 1행 upsert (시계열 보존은 옵션 archive로 분리, P8 진입 시 결정)
- **인증**: 시민 익명 + 운영자 ENV 비밀번호 lock-in (Kakao Login 미사용)
- **PWA**: 미포함 (모바일 반응형까지)
- **자치구 경계**: 서울 열린데이터광장 SHP(SRID 5186) → GeoJSON(EPSG 4326) 1회 변환 lock-in
- **보안 정책**: secret(INGEST_TOKEN/ADMIN_PASSWORD/SESSION_SECRET/IP_SALT) 4개는 `openssl rand -hex 32`로 생성, 시연 직전 1회 회전, `.env*`는 `.gitignore`
- **보안**: 시민 제보는 익명 토큰 + rate limit. 시민 위치는 서버 영구저장 금지(세션 단위만)
- **접근성**: 데스크탑/모바일 반응형 필수. PWA 옵션(서비스워커는 후순위)
- **언어**: UI 한국어

## Non-Goals

- **AI 모델 학습/추론** (ConvLSTM, U-Net, GNN, Graph-WaveNet 모두 제외)
- **알림 발송 채널 전체** (FCM 웹푸시, SENS SMS, Twilio 음성통화 모두 제외)
- 보호자 대시보드 / 고령층 자동전화 / 음성 TTS (알림 채널 의존이므로 자동 제외)
- **CBS 재난문자 연계** (행안부 API 부재)
- **S-Map 디지털 트윈 3D 연계** (3단계 이후, 데모 범위 외)
- **마이크로서비스/이원화 백엔드** (NestJS+FastAPI 이원화 제외 → Next.js 단일)
- **시민 제보 신뢰도 자동검증 알고리즘** (운영자가 목록만 보면 됨)
- **운영자 워크플로우 깊이** (경보정책 조정 / 현장확인 요청 / 카메라 피드 제외)
- **24/7 운영·관제·HA·모니터링 스택** (Prometheus/Grafana/Loki/OTel 제외)
- **실사용자 트래픽** (데모 시연 + 심사용)
- **CCTV 영상 추론**, **시민 제보 사진 ML 분류**

## Acceptance Criteria

### A. 배포 및 인프라
- [ ] 외부 도메인 또는 Vercel preview URL에 누구나 접속 가능
- [ ] HTTPS 적용
- [ ] README에 환경변수 목록·로컬 실행 방법·배포 방법·외부 API 키 발급 절차 기록

### B. 데이터 수집 파이프라인
- [ ] KMA 초단기실황(getUltraSrtNcst) 5~10분 주기 수집
- [ ] KMA 초단기예보(getUltraSrtFcst) 1시간 주기 수집
- [ ] 서울시 하천 수위(ListRiverStageService) 10분 주기 수집
- [ ] 서울시 하수관로 수위(DrainpipeMonitoringInfo) 10분 주기 수집
- [ ] TOPIS 도로 소통/돌발 5~10분 주기 수집
- [ ] 침수예상도·수해대피소·빗물펌프장 정적 데이터 1회 적재
- [ ] 모든 외부 API 호출 결과는 Postgres에 시계열로 저장(테이블에 `fetched_at`, `valid_at` 보존)
- [ ] API 실패 시 재시도 + 에러 로깅, 마지막 성공 시각이 UI에 표시됨

### C. 위험도 산정 (룰베이스)
- [ ] 서울을 ~250m 격자로 분할(최소 자치구 25개 경계와 정합)
- [ ] 각 셀에 대해 다음 입력을 결합한 위험점수(0.0~1.0) 산정:
  - 최근 10/30/60분 누적 강수(KMA HSR 또는 초단기실황)
  - 인접 하천 수위계의 위험 임계 대비 비율
  - 인접 하수관로 수위계의 상승 속도/포화도
  - 정적 침수예상도와의 중첩(저지대 가중)
  - 인접 도로 통제/돌발 보정
- [ ] 임계값 기반 등급 분류: SAFE / LOW / MEDIUM / HIGH (4단계, 색상 구분)
- [ ] 산정 공식·가중치는 README와 코드 주석에 명시
- [ ] 산정 결과 5~10분 주기 갱신, 셀 단위 시계열 보존

### D. 시민 화면(메인)
- [ ] Kakao Map 기반 지도, 서울 전역 초기 줌
- [ ] 위험 셀 컬러 오버레이(SAFE 투명/LOW 노랑/MED 주황/HIGH 빨강)
- [ ] 레이어 토글: 위험 셀 / 침수예상도 / 대피소 / 빗물펌프장 / 도로 통제 / 하천 수위계
- [ ] 줌 레벨에 따라 셀 해상도 또는 클러스터링 자동 조정
- [ ] 사용자 위치 권한 허용 시 현재 위치 위험 셀의 점수·등급·"지금 해야 할 행동" 카드 표시
- [ ] 행동 카드 텍스트는 등급별 정해진 한국어 문구(예: HIGH = "이 지역 통행 자제, 가까운 대피소 확인")
- [ ] 가까운 대피소 거리·도보 경로 보기 버튼

### E. 안전경로
- [ ] 출발/도착 입력 시 Kakao Local 주소→좌표 변환
- [ ] 도보·차량 경로 호출(Kakao Mobility 또는 단순 직선/Naver Directions 5 백업)
- [ ] 경로가 HIGH 셀을 통과하는 경우 화면에 경고 + (가능하면) 대안 1건 표시
- [ ] MVP에서는 위험 셀 완전 회피 라우팅은 옵션. 통과 여부 표시까지가 필수

### F. 시민 제보
- [ ] 익명 또는 Kakao Login(택1) 후 제보 가능
- [ ] 입력: 좌표(현재 위치 또는 지도 클릭), 물높이 단계(발목/무릎/허벅지/그 이상), 통행불가 여부(보행/유모차/휠체어/차량), 짧은 메모, 사진 1장(선택)
- [ ] 제보 즉시 지도에 마커 표시(자기 제보)
- [ ] 같은 자치구 내 모든 제보가 운영자 콘솔과 시민 지도 마커 레이어에 노출
- [ ] rate limit: 동일 IP/디바이스 1분당 3건 이하

### G. 운영자 콘솔(가벼움)
- [ ] `/admin` 라우트 + 단순 비밀번호 또는 Kakao 화이트리스트 인증
- [ ] Top 20 위험 셀 표(셀ID, 점수, 등급, 인접 자치구, 갱신시각)
- [ ] 최근 제보 50건 표(시각, 자치구, 등급, 사진 썸네일)
- [ ] 데이터 수집 헬스 표(API별 마지막 성공 시각, 최근 1시간 실패 횟수)
- [ ] 경보 정책 조정·외부 발송 트리거는 **없음**

### H. 시연 자산
- [ ] README에 시스템 다이어그램 1개, 시연 GIF/영상 1개 첨부
- [ ] 1~2개 호우 사례를 mock 또는 과거 데이터로 replay 가능한 데모 모드 1개(필수 아님, 가산점)

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|---|---|---|
| 보고서 추천 스택 그대로 가야 한다 | Round 4 Contrarian — 솔로 학생에게 NestJS+FastAPI+K8s가 진짜 필수인가? | Next.js fullstack 단일 스택으로 단순화 |
| AI 모델 nowcast가 핵심 가치다 | Round 3 — 룰베이스로도 위험맵 작동 가능한가? | AI 학습 제외, 룰베이스 임계+가중합으로 충분 |
| 알림 채널(SMS/Voice/Push)이 차별점이다 | Round 3 — 데모에서 알림 발송 검증이 가능한가? | 알림 전 채널 비용·복잡도 대비 데모 가치 낮아 제외 |
| MVP는 1~2개 자치구 시범이 정석이다 | Round 5 — 데모 임팩트로는 서울 전역이 더 보기 좋은가? | 서울 25개 자치구 전체로 확장 (대신 운영자 콘솔은 가볍게) |
| 운영자 콘솔이 풀-피처 워크플로우여야 한다 | Round 5 — 1인 솔로가 시민+운영자 양쪽을 동시에 깊게 만들 수 있는가? | 운영자 콘솔은 "표 + 헬스" 수준 단순 구현 |

## Technical Context (Greenfield, 빈 디렉토리)

```
/weather
├── deep-research-report.md       (입력 보고서)
├── .omc/                         (인터뷰/사양 산출)
└── (이하 신규 구축)
    ├── apps/web/                 Next.js App Router
    ├── packages/db/              Drizzle 또는 Prisma 스키마
    ├── packages/ingest/          외부 API 어댑터(KMA/Seoul/TOPIS)
    ├── packages/risk/            룰베이스 위험도 산정 모듈
    └── packages/geo/             격자 생성·PostGIS 헬퍼
```

**핵심 라이브러리(권장)**:
- 지도: `react-kakao-maps-sdk`
- DB ORM: Drizzle ORM(PostGIS 친화) 또는 Prisma + raw SQL hybrid
- 폼: React Hook Form + zod
- HTTP: native `fetch` + `p-retry`
- 백그라운드 작업: Vercel Cron + `app/api/cron/*` 라우트
- 좌표 처리: `proj4` (EPSG:4326 ↔ EPSG:5186 변환)
- 시각화: Kakao Maps overlay + 격자는 GeoJSON 또는 vector tile(`@mapbox/vector-tile`)

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| Demo Project | meta | name, scope, deadline | — |
| Next.js Fullstack App | system | runtime, deploy_target | hosts → Risk Map / Public API Integration / Ops Console |
| Public API Integration | external system | provider, endpoint, key, quota | feeds → Risk Cell |
| Risk Cell | core domain | cell_id, lat, lon, score, level, ts, inputs[] | grouped_into → Gu(자치구), source_for → Risk Map |
| Risk Map | view | bounds, zoom, layers | shows → Risk Cell, Citizen Report |
| Citizen Report | core domain | id, lat, lon, depth_step, mobility_block[], photo_url, created_at | located_in → Gu |
| Safe Route | view | origin, destination, profile, segments[] | crosses → Risk Cell |
| Shelter | static spatial | shelter_id, lat, lon, capacity | located_in → Gu |
| Rain Pump Station | static spatial | id, lat, lon | located_in → Gu |
| Flood Forecast Map | static spatial | polygons | overlays → Risk Cell |
| Ops Console | view (light) | top20_cells, recent_reports, api_health | reads → Risk Cell, Citizen Report |
| Postgres + PostGIS | data store | tables[], extensions[] | persists → Risk Cell, Citizen Report, External Snapshots |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability |
|---|---|---|---|---|---|
| 1 | 1 | 1 | — | — | N/A |
| 2 | 4 | 3 | 0 | 1 | 25% |
| 3 | 9 | 5 | 0 | 4 | 44% |
| 4 | 11 | 2 | 1 (Deployed Web App → Next.js Fullstack App) | 8 | 82% |
| 5 | 12 | 1 (Rain Pump Station 명시) | 0 | 11 | 92% |

## Interview Transcript

<details>
<summary>Round 1~5</summary>

**Round 1 — Targeting Goal Clarity**
Q: 이 시스템을 어떤 맥락과 규모로 구현하시려고 하나요?
A: 학생/개인 프로젝트 (데모급)
Ambiguity: 100% → 71.5%

**Round 2 — Targeting Success Criteria**
Q: 이 데모가 시연되는 장면과 형태는 어떤 수준인가요?
A: 배포된 웹 + 실제 공공 API 연결 (실데이터)
Ambiguity: 71.5% → 49.5%

**Round 3 — Targeting Constraint Clarity (시간)**
Q: 데모 완성까지 가용한 시간 budget은? (혼자/팀 규모와 함께)
A: AI, 알림 및 SMS 제외. 나머지 MVP 기능 모두 구현. (시간 미명시, 스코프 답변)
Ambiguity: 49.5% → 31.5%

**Round 4 — Contrarian Mode, Targeting Constraint Clarity (스택)**
Q: 보고서 권장 스택(NestJS+FastAPI+K8s+...)이 진짜 필수인가? 실제로 식숙이 있을 스택은?
A: Next.js fullstack 단일 스택 (TypeScript)
Ambiguity: 31.5% → 18.1% (Threshold ✅)

**Round 5 — Targeting Success Criteria 잔여**
Q: 지리적 범위와 운영자 콘솔의 깊이?
A: 서울 전역 + 운영자 콘솔 적은 구현
Ambiguity: 18.1% → **10.4%**

</details>

## 권장 단계별 구현 로드맵 (학생 솔로, 14~17주 lock-in)

| Phase | 기간 | 산출물 | 검증 |
|---|---|---|---|
| 0. 셋업 | 1.0~1.25주 | Next.js + Supabase(Postgres+PostGIS) + Vercel + Kakao/KMA/서울/TOPIS 키 발급 + 도메인 화이트리스트 | `pnpm dev` + DB 연결 헬스체크 |
| 1. 외부 데이터 어댑터 | 3.5~4주 | KMA/서울 하천·하수/TOPIS 어댑터 + GitHub Actions cron `/api/ingest/all` + 단일 SQL upsert 위험 셀 | 어댑터별 fixture 단위테스트 + cron 1일 적재 확인 |
| 2. 정적 지도 + 레이어 | 2주 | Kakao 지도 + 자치구 경계 + 침수예상도/대피소/펌프장 + StaleBanner | 줌·팬·토글 + cron 끄고 5분 후 stale 노랑 |
| 3. 룰베이스 위험 셀 | 3~4주 (단일 Phase 중 최대 위험) | 격자 9,700 셀 + 점수 산정 + zoom 14 분기(`/api/risk/cells` ↔ `/api/risk/aggregated`) + 자동 aggregated fallback | unit 시나리오 5개, zoom 13/15 가시화 |
| 4. 시민 화면 | 1.5주 | 위치 권한 → 행동 카드 + 등급별 한국어 + 가까운 대피소 | 모바일 1대 + 데스크 1 |
| 5. 시민 제보 | 1~1.5주 | 폼 + Supabase Storage(signed URL 1주, 1.5MB reject) + 마커 + 1분 3건 rate limit | 폼 e2e + 4번째 → 429 |
| 6. 안전경로 | 1.5~2주 | 카카오 주소→좌표 + 경로 + HIGH 셀 통과 경고 + Mobility 미발급 fallback(haversine m) | 송파→광진 HIGH 통과 경고 |
| 7. 운영자 콘솔 | 1~1.5주 | `/admin` Top 20 + 제보 50 + API 헬스 표 (ENV 비밀번호 인증) | 비번 틀림 → 401, 정상 → 5초 polling |
| 8. 배포·시연자산 | 1주 | 도메인, README(Security/디버깅 섹션 포함), 다이어그램(박스 6+화살표 5), 시연 GIF 30초 | 외부 시연 1시간 안 |

**합계**: 14.5~17.75주 (Phase 0 buffer 포함)

## 사용자 확정 완료 (2026-05-06)

다음 6개 결정 모두 ralplan(Architect+Critic) 검토 후 사용자가 직접 lock-in (Round 1~2 잔여 검토):

1. ✅ **DB/Storage**: **Supabase** (DB+Storage 통합)
2. ✅ **격자 해상도**: **250m, 약 9,700 셀**
3. ✅ **인증**: **익명만 + 운영자 ENV 비밀번호** (Kakao Login 미사용)
4. ✅ **시연 데이터 모드**: **라이브만 lock-in**. replay는 P8 옵션 — `risk_score_archive` 테이블+`scripts/replay-seed.ts` 골격만 준비, 적재는 P8 진입 시 결정 (mock fixture 또는 production current 스냅샷)
5. ✅ **PWA**: **미포함** (모바일 반응형까지)
6. ✅ **자치구 경계**: **서울 열린데이터광장 SHP(5186) → GeoJSON(4326) 1회 변환**

## Ralplan 합의 결과 (2026-05-06)

- **Planner v1 → v2**: NeedsRevision (5 시급 + 9 권장 반영)
- **Architect re-review v2**: READY_FOR_CRITIC (silent regression 0)
- **Critic v2**: APPROVE (blocker 0, important 7, nice-to-have 6)
- **사용자 잔여 검토 6라운드**: 19/19 결정 lock-in
  - Important 6건 적용: D-1 (AC 매핑 표 비고), D-2 (archive P8 결정), D-3 (자동 aggregated), C-1 (secret 회전), C-5 (signed URL 1주), C-8 (server 1.5MB reject)
  - C-3 (tier 모니터링): 사용자 결정으로 **제외**
  - Nice-to-have 6건 모두 적용: P0 buffer, P3 fallback 임계, P5 Non-Goal 가드, README 디버깅 섹션, P6 fallback 좌표·단위, README 다이어그램 임계
  - 사용자 확정 6건: 모두 권장안 그대로 lock-in
- **최종 spec/plan 상태**: spec FINAL + plan v3 (Planner v3 작업 중)
- **다음 단계**: autopilot Phase 2 진입 가능
