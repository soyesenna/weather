export const env = {
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'reports-photos',
  kmaKey: process.env.KMA_KEY,
  seoulKey: process.env.SEOUL_KEY,
  topisKey: process.env.TOPIS_KEY,
  kakaoRestKey: process.env.KAKAO_REST_KEY,
  kakaoJsKey: process.env.NEXT_PUBLIC_KAKAO_JS_KEY,
  kakaoMobilityKey: process.env.KAKAO_MOBILITY_KEY,
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
  ingestToken: process.env.INGEST_TOKEN,
  ipSalt: process.env.IP_SALT ?? 'demo-only-salt',
  ingestFetchTimeoutMs: Number(process.env.INGEST_FETCH_TIMEOUT_MS ?? 8000),
  timezone: process.env.TZ ?? 'Asia/Seoul',
};

export function requireServerEnv(key: keyof typeof env): string {
  const value = env[key];
  if (!value || typeof value !== 'string') throw new Error(`Missing required environment variable: ${String(key)}`);
  return value;
}
