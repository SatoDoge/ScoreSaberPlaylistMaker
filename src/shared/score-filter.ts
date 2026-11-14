import { accuracyPercent, ppValue, type OwnScore, type ScoreSaberScoreRecord } from "./scoresaber";

export interface RangeBound {
  min?: number;
  max?: number;
}

export type SelfCompare = "unplayed" | "played" | "win" | "lose" | "tie";

export interface ScoreFilter {
  star?: RangeBound;
  pp?: RangeBound;
  accuracy?: RangeBound;
  misses?: RangeBound;
  limit?: number;
  unrankedOnly: boolean;
  noFailOnly: boolean;
  selfCompare?: SelfCompare;
}

export function scoreMatchesFilter(
  record: ScoreSaberScoreRecord,
  filter: ScoreFilter,
  ownScores?: ReadonlyMap<number, OwnScore>,
): boolean {
  if (!matchesSelfCompare(record, filter.selfCompare, ownScores)) {
    return false;
  }
  if (filter.unrankedOnly && isRanked(record)) {
    return false;
  }
  if (filter.noFailOnly && !hasNoFail(record)) {
    return false;
  }
  if (!matchesStar(record, filter.star)) {
    return false;
  }
  if (!within(ppValue(record), filter.pp)) {
    return false;
  }
  if (!within(accuracyPercent(record), filter.accuracy)) {
    return false;
  }
  return within(missCount(record), filter.misses);
}

export function filterScores(
  records: readonly ScoreSaberScoreRecord[],
  filter: ScoreFilter,
  ownScores?: ReadonlyMap<number, OwnScore>,
): { matched: ScoreSaberScoreRecord[]; shown: ScoreSaberScoreRecord[] } {
  const matched = records.filter((record) => scoreMatchesFilter(record, filter, ownScores));
  const shown = filter.limit === undefined ? matched : matched.slice(0, filter.limit);
  return { matched, shown };
}

export function isScoreFilter(value: unknown): value is ScoreFilter {
  if (!isRecord(value) || typeof value.unrankedOnly !== "boolean" || typeof value.noFailOnly !== "boolean") {
    return false;
  }
  return (
    isOptionalRange(value.star) &&
    isOptionalRange(value.pp) &&
    isOptionalRange(value.accuracy) &&
    isOptionalRange(value.misses) &&
    isOptionalLimit(value.limit) &&
    isOptionalSelfCompare(value.selfCompare)
  );
}

const SELF_COMPARES: readonly SelfCompare[] = ["unplayed", "played", "win", "lose", "tie"];

export function selfCompareResult(theirs: OwnScore, mine: OwnScore): "win" | "lose" | "tie" {
  if (mine.acc !== theirs.acc) {
    return mine.acc > theirs.acc ? "win" : "lose";
  }
  if (mine.pp !== theirs.pp) {
    return mine.pp > theirs.pp ? "win" : "lose";
  }
  return "tie";
}

function matchesSelfCompare(
  record: ScoreSaberScoreRecord,
  compare: SelfCompare | undefined,
  ownScores: ReadonlyMap<number, OwnScore> | undefined,
): boolean {
  if (!compare || !ownScores) {
    return true;
  }
  const mine = ownScores.get(record.leaderboard.id);
  if (compare === "unplayed") {
    return mine === undefined;
  }
  if (!mine) {
    return false;
  }
  if (compare === "played") {
    return true;
  }
  const theirs: OwnScore = { acc: accuracyPercent(record), pp: ppValue(record), mod: "" };
  return selfCompareResult(theirs, mine) === compare;
}

function isOptionalSelfCompare(value: unknown): value is SelfCompare | undefined {
  return value === undefined || (typeof value === "string" && SELF_COMPARES.includes(value as SelfCompare));
}

function matchesStar(record: ScoreSaberScoreRecord, range: RangeBound | undefined): boolean {
  if (!range) {
    return true;
  }
  if ((range.min === 0 || range.max === 0) && !isRanked(record)) {
    return false;
  }
  return within(starValue(record), range);
}

function within(value: number, range: RangeBound | undefined): boolean {
  if (!range) {
    return true;
  }
  if (range.min !== undefined && value < range.min) {
    return false;
  }
  return range.max === undefined || value <= range.max;
}

function starValue(record: ScoreSaberScoreRecord): number {
  const stars = record.leaderboard.realm?.stars;
  return typeof stars === "number" ? stars : 0;
}

function missCount(record: ScoreSaberScoreRecord): number {
  return (record.score.missedNotes ?? 0) + (record.score.badCuts ?? 0);
}

function isRanked(record: ScoreSaberScoreRecord): boolean {
  return record.leaderboard.realm?.leaderboardStatus === "RANKED";
}

function hasNoFail(record: ScoreSaberScoreRecord): boolean {
  return Array.isArray(record.score.mods) && record.score.mods.includes("NF");
}

function isOptionalRange(value: unknown): value is RangeBound | undefined {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return isOptionalNumber(value.min) && isOptionalNumber(value.max);
}

function isOptionalLimit(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 1);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
