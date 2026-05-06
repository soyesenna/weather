# Open Questions Tracker

## seoul-flood-demo-plan - v1 questions (v2에서 모두 해소, v3에서 추가 lock-in)

- [x] **TOPIS API 인증·쿼터** — v2 ADR-005 + 섹션 6 각주 1로 degradation tier (TOPIS 미발급 시 R_road=0 fallback). 점수 영향 ≤ 5%.
- [x] **Kakao Mobility quota** — v2 Phase 6 fallback. **v3 P6 patch에서 fallback 좌표·단위 lock-in**: 도보 = haversine(m, 소수점 0자리), Polyline 흰색 stroke 4px, ST_Intersects fallback도 동일 SQL.
- [x] **Vercel Hobby cron 상한** — v2 ADR-005 GitHub Actions cron 1개 + `/api/ingest/all`로 통합. Vercel Cron은 cleanup 1개만.
- [x] **격자 송출 방식** — v2 ADR-007 DB+BBox API + zoom 14 분기. **v3 D-3 patch에서 auto-aggregated graceful degrade lock-in**: BBox > 50km² 또는 셀 > 1,500이면 자동 `gus[]` 응답 + `X-Auto-Aggregated: true` 헤더. 409 거부 폐기.
- [x] **시민 제보 사진 저장소** — v2 ADR-002 Supabase Storage. **v3 C-5/C-8 patch에서 lock-in**: signed URL TTL 1주, bucket private, server-side `Content-Length > 1.5MB` 즉시 413 reject.

## seoul-flood-demo-plan - 사용자 확정 6건 (v2에서 모두 lock-in, v3 변경 없음)

- [x] DB·Storage — Supabase (둘 다)
- [x] 격자 해상도 — 250m, 약 9,700 셀
- [x] 인증 — 익명만 + 운영자 ENV 비밀번호
- [x] 시연 데이터 모드 — 라이브만, replay는 P8 옵션
- [x] PWA — 포함하지 않음
- [x] 자치구 경계 — 서울 열린데이터광장 SHP(SRID 5186) → GeoJSON(4326) 1회

## seoul-flood-demo-plan - v3 의도적 deferral (잔여 결정 1건)

- [ ] **archive 데이터 출처 (P8 진입 시 결정)** — ADR-008 D-2 lock-in으로 **plan v3 단계에서는 결정하지 않고 P8 진입 시점에 결정**. 지금은 `risk_score_archive` 테이블 스키마와 `scripts/replay-seed.ts` 골격만 준비. P8 후보:
  - (a) `packages/risk/__tests__/scenarios.test.ts` 형식의 mock fixture 적재
  - (b) production `risk_score_current` 임의 시점 `pg_dump` 후 INSERT
  - production cron의 dual-write 없음 (P3 단순도 유지).

## seoul-flood-demo-plan - v3 patch 적용 결정 (Critic-author 검증 완료, 12건 lock-in + 1건 제외)

- **적용 12건**: D-1, D-2, D-3, C-1, C-5, C-8, P0 buffer, P3 fallback 임계, P5 Non-Goal 가드, README 디버깅 섹션, P6 fallback 좌표·단위, README 다이어그램 임계.
- **제외 1건**: **C-3 (tier 한도 모니터링)** — 사용자 결정으로 patch 미적용. 데모급 맥락에서 시연 직전 수동 quota 체크로 충분.

## v3 신규 잔여

위 "v3 의도적 deferral" 1건 외에 신규 모호도 없음. Critic 라운드에서 추가 발견 시 본 파일에 append.
