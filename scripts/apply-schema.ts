import { readFileSync, existsSync } from 'fs';
import postgres from 'postgres';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ??= value;
  }
}
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DIRECT_URL or DATABASE_URL is required');
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const statements = readFileSync('db/schema.sql', 'utf8')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await sql.unsafe(statement);
  await sql.end();
  console.log(JSON.stringify({ ok: true, statements: statements.length }, null, 2));
}

main().catch(async (error) => { console.error(error); await sql.end({ timeout: 1 }); process.exit(1); });
