#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-}"
if [[ -z "$BASE_URL" ]]; then
  echo "Usage: scripts/deployment-smoke.sh https://<deployed-url>" >&2
  exit 2
fi
if [[ "$BASE_URL" != https://* ]]; then
  echo "BASE_URL must be HTTPS for acceptance: $BASE_URL" >&2
  exit 2
fi
BASE_URL="${BASE_URL%/}"

cleanup_files=()
cleanup() {
  for file in "${cleanup_files[@]}"; do
    [[ -f "$file" ]] && rm -f "$file"
  done
}
trap cleanup EXIT

echo "[1/6] HTTPS health"
curl -fsS "$BASE_URL/api/health" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("ok") is True; print("ok db=", d.get("db"), "health=", len(d.get("health", [])))'

echo "[2/6] risk auto aggregation"
headers="$(mktemp)"
body="$(mktemp)"
cleanup_files+=("$headers" "$body")
curl -fsS -D "$headers" -o "$body" "$BASE_URL/api/risk/cells?bbox=126.7,37.4,127.2,37.7&zoom=13"
grep -qi '^x-auto-aggregated: true' "$headers"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d.get("auto_aggregated") is True; assert len(d.get("gus", [])) > 0; print("gus=", len(d["gus"]))' "$body"

echo "[3/6] static layers"
curl -fsS "$BASE_URL/api/static/layers" | python3 -c 'import json,sys; d=json.load(sys.stdin); required=["floodPolygons","shelters","pumpStations","riverGauges","roadIncidents"]; missing=[k for k in required if len(d.get(k, [])) == 0]; assert not missing, missing; print({k: len(d[k]) for k in required})'

echo "[4/6] Kakao public config"
curl -fsS "$BASE_URL/api/config/public" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("hasKakaoJsKey") is True; key=d.get("kakaoJsKey", ""); assert len(key) >= 8; print("hasKakaoJsKey=true keyLength=", len(key), "origin=", d.get("deploymentOrigin"))'

echo "[5/6] admin rejects wrong password"
admin_body="$(mktemp)"
cleanup_files+=("$admin_body")
status="$(curl -s -o "$admin_body" -w '%{http_code}' -X POST "$BASE_URL/api/admin/login" -H 'content-type: application/json' -d '{"password":"wrong"}')"
[[ "$status" == "401" ]]
echo "admin_bad_status=$status"

echo "[6/6] page shell"
curl -fsS "$BASE_URL" | grep -q '서울 침수 위험'
echo "deployment smoke passed"
echo "visual note: Kakao Developers Web platform must whitelist $BASE_URL for the SDK to render instead of diagnostic fallback."
