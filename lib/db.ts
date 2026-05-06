import postgres from 'postgres';
import { env } from './env';

let sqlSingleton: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!env.databaseUrl) return null;
  sqlSingleton ??= postgres(env.databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return sqlSingleton;
}

export async function dbAvailable() {
  const sql = getSql();
  if (!sql) return false;
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeSql() {
  if (sqlSingleton) {
    await sqlSingleton.end({ timeout: 1 });
    sqlSingleton = null;
  }
}
