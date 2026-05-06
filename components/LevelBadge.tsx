import { LEVEL_LABEL } from '@/packages/risk/scoring';
import type { RiskLevel } from '@/lib/types';

export function LevelBadge({ level }: { level: RiskLevel }) {
  return <span className={`badge level-${level}`}>{LEVEL_LABEL[level]}</span>;
}
