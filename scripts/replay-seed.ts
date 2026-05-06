import { readFileSync, existsSync } from 'fs';

function loadLocalEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    process.env[trimmed.slice(0, index)] ??= trimmed.slice(index + 1);
  }
}

async function main() {
  loadLocalEnv();
  const [{ ingestDemoSnapshot }, { upsertHealth, upsertRiskCells }, { closeSql }] = await Promise.all([
    import('@/packages/risk/demo-data'),
    import('@/lib/repositories'),
    import('@/lib/db'),
  ]);
  const snapshot = ingestDemoSnapshot();
  await upsertHealth(snapshot.sources);
  const result = await upsertRiskCells(snapshot.cells);
  console.log(JSON.stringify({ ok: true, cells: snapshot.cells.length, result }, null, 2));
  await closeSql();
}
main().catch((error) => { console.error(error); process.exit(1); });
