export const SCORE_PAGE_SIZE = 100;

export interface ScoreSaberScoreRecord {
  score: {
    createdAt: string;
    accuracy?: number;
    pp?: number;
    mods?: string[];
    missedNotes?: number;
    badCuts?: number;
    player?: {
      name?: string;
    };
  };
  leaderboard: {
    id: number;
    map?: {
      songName?: string;
      levelAuthorName?: string;
      coverUrl?: string;
      bsid?: string;
      hash?: string;
    };
    difficulty?: {
      difficulty?: number;
      gameMode?: string;
      rawDifficulty?: string;
    };
    realm?: {
      stars?: number;
      leaderboardStatus?: string;
    };
  };
}

export interface ScoreSaberScorePage {
  data: ScoreSaberScoreRecord[];
  metadata: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}

export type ScoreWrite = "insert" | "update" | "unchanged";

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Es",
  3: "N",
  5: "H",
  7: "Ex",
  9: "E+",
};

const DIFFICULTY_NAME: Record<number, string> = {
  1: "Easy",
  3: "Normal",
  5: "Hard",
  7: "Expert",
  9: "ExpertPlus",
};

export function playerIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "scoresaber.com") {
      return null;
    }
    return parsed.pathname.match(/^\/u\/(\d+)\/?/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function scoresPageUrl(playerId: string, page: number): string {
  const url = new URL(`https://scoresaber.com/api/v2/players/${encodeURIComponent(playerId)}/scores`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(SCORE_PAGE_SIZE));
  url.searchParams.set("sort", "recent");
  url.searchParams.set("personalBest", "true");
  return url.toString();
}

export function isScoreRecord(value: unknown): value is ScoreSaberScoreRecord {
  if (!isRecord(value) || !isRecord(value.score) || !isRecord(value.leaderboard)) {
    return false;
  }
  return typeof value.score.createdAt === "string" && typeof value.leaderboard.id === "number";
}

export function parseScorePage(value: unknown): ScoreSaberScorePage | undefined {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.metadata)) {
    return undefined;
  }
  const metadata = value.metadata;
  if (
    typeof metadata.page !== "number" ||
    typeof metadata.totalPages !== "number" ||
    typeof metadata.totalItems !== "number"
  ) {
    return undefined;
  }
  const data = value.data.filter(isScoreRecord);
  if (value.data.length > 0 && data.length === 0) {
    return undefined;
  }
  return {
    data,
    metadata: {
      page: metadata.page,
      totalPages: metadata.totalPages,
      totalItems: metadata.totalItems,
    },
  };
}

export function scoreCreatedAt(record: ScoreSaberScoreRecord): number {
  const time = Date.parse(record.score.createdAt);
  return Number.isFinite(time) ? time : 0;
}

export function scoreWriteAction(
  cached: ScoreSaberScoreRecord | undefined,
  fetched: ScoreSaberScoreRecord,
): ScoreWrite {
  if (!cached) {
    return "insert";
  }
  return scoreCreatedAt(fetched) > scoreCreatedAt(cached) ? "update" : "unchanged";
}

export function shouldStopPaging(cacheIsComplete: boolean, action: ScoreWrite): boolean {
  return cacheIsComplete && action === "unchanged";
}

export interface OwnScore {
  acc: number;
  mod: string;
  pp: number;
}

export interface CollectedMap {
  picture: string;
  difficulty: string;
  badge: string;
  name: string;
  levelOtherName: string;
  acc: number;
  mod: string;
  pp: number;
  mine?: OwnScore;
  leaderboardUrl: string;
  beatSaverUrl: string;
  hash: string;
  characteristic: string;
  difficultyName: string;
}

export function accuracyPercent(record: ScoreSaberScoreRecord): number {
  const accuracy = record.score.accuracy;
  return typeof accuracy === "number" ? Math.round(accuracy * 10000) / 100 : 0;
}

export function ppValue(record: ScoreSaberScoreRecord): number {
  const pp = record.score.pp;
  return typeof pp === "number" ? Math.round(pp * 100) / 100 : 0;
}

export function toCollectedMap(record: ScoreSaberScoreRecord): CollectedMap {
  const mods = record.score.mods;
  const difficulty = DIFFICULTY_LABEL[record.leaderboard.difficulty?.difficulty ?? -1] ?? "?";
  return {
    picture: record.leaderboard.map?.coverUrl ?? "",
    difficulty,
    badge: rankBadge(record, difficulty),
    name: record.leaderboard.map?.songName ?? "",
    levelOtherName: record.leaderboard.map?.levelAuthorName ?? "",
    acc: accuracyPercent(record),
    mod: Array.isArray(mods) ? mods.join(",") : "",
    pp: ppValue(record),
    leaderboardUrl: `https://scoresaber.com/leaderboard/${record.leaderboard.id}`,
    beatSaverUrl: beatSaverPageUrl(record.leaderboard.map?.bsid),
    hash: record.leaderboard.map?.hash?.trim().toUpperCase() ?? "",
    characteristic: mapCharacteristic(record.leaderboard.difficulty?.gameMode),
    difficultyName: mapDifficultyName(record.leaderboard.difficulty),
  };
}

function mapCharacteristic(gameMode: string | undefined): string {
  const name = gameMode?.replaceAll("Solo", "") ?? "";
  return name || "Standard";
}

function mapDifficultyName(difficulty: ScoreSaberScoreRecord["leaderboard"]["difficulty"]): string {
  const fromRaw = difficulty?.rawDifficulty?.split("_")[1];
  if (fromRaw) {
    return fromRaw;
  }
  if (typeof difficulty?.difficulty === "number") {
    return DIFFICULTY_NAME[difficulty.difficulty] ?? "ExpertPlus";
  }
  return "ExpertPlus";
}

function beatSaverPageUrl(bsid: string | undefined): string {
  const id = bsid?.trim();
  return id ? `https://beatsaver.com/maps/${encodeURIComponent(id)}` : "";
}

function rankBadge(record: ScoreSaberScoreRecord, difficulty: string): string {
  const stars = record.leaderboard.realm?.stars;
  if (record.leaderboard.realm?.leaderboardStatus === "RANKED" && typeof stars === "number") {
    return `${Number(stars.toFixed(2))}★`;
  }
  return difficulty;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
