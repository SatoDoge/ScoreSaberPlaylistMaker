import { isScoreFilter, type ScoreFilter } from "./score-filter";
import type { CollectedMap } from "./scoresaber";

export const PING = "ping" as const;
export const PONG = "pong" as const;
export const SYNC_PLAYER_SCORES = "sync-player-scores" as const;
export const SYNC_PROGRESS = "sync-progress" as const;
export const SYNC_FINISHED = "sync-finished" as const;
export const SYNC_FAILED = "sync-failed" as const;
export const GET_CACHED_SCORES = "get-cached-scores" as const;

export interface PingMessage {
  type: typeof PING;
}

export interface PongMessage {
  type: typeof PONG;
  href: string;
}

export interface SyncPlayerScoresMessage {
  type: typeof SYNC_PLAYER_SCORES;
  playerId: string;
}

export interface SyncProgressMessage {
  type: typeof SYNC_PROGRESS;
  playerId: string;
  page: number;
  totalPages: number;
  inserted: number;
  updated: number;
}

export interface SyncPlayerScoresResult {
  playerId: string;
  playerName: string;
  pagesFetched: number;
  totalPages: number;
  inserted: number;
  updated: number;
  cachedCount: number;
  stoppedEarly: boolean;
}

export interface SyncFinishedMessage {
  type: typeof SYNC_FINISHED;
  result: SyncPlayerScoresResult;
}

export interface SyncFailedMessage {
  type: typeof SYNC_FAILED;
  playerId: string;
  error: string;
}

export interface GetCachedScoresMessage {
  type: typeof GET_CACHED_SCORES;
  playerId: string;
  filter: ScoreFilter;
  selfPlayerId?: string;
}

export type SyncPlayerScoresResponse =
  | { ok: true; result: SyncPlayerScoresResult }
  | { ok: false; error: string; alreadyRunning?: boolean };

export type GetCachedScoresResponse =
  | { ok: true; scores: CollectedMap[]; matchedCount: number; cachedCount: number }
  | { ok: false; error: string };

export function isPingMessage(value: unknown): value is PingMessage {
  return isRecord(value) && value.type === PING;
}

export function isPongMessage(value: unknown): value is PongMessage {
  return isRecord(value) && value.type === PONG && typeof value.href === "string";
}

export function isSyncPlayerScoresMessage(value: unknown): value is SyncPlayerScoresMessage {
  return isRecord(value) && value.type === SYNC_PLAYER_SCORES && typeof value.playerId === "string";
}

export function isSyncProgressMessage(value: unknown): value is SyncProgressMessage {
  return (
    isRecord(value) &&
    value.type === SYNC_PROGRESS &&
    typeof value.playerId === "string" &&
    typeof value.page === "number" &&
    typeof value.totalPages === "number" &&
    typeof value.inserted === "number" &&
    typeof value.updated === "number"
  );
}

export function isSyncFinishedMessage(value: unknown): value is SyncFinishedMessage {
  return isRecord(value) && value.type === SYNC_FINISHED && isSyncResult(value.result);
}

export function isSyncFailedMessage(value: unknown): value is SyncFailedMessage {
  return (
    isRecord(value) &&
    value.type === SYNC_FAILED &&
    typeof value.playerId === "string" &&
    typeof value.error === "string"
  );
}

export function isGetCachedScoresMessage(value: unknown): value is GetCachedScoresMessage {
  return (
    isRecord(value) &&
    value.type === GET_CACHED_SCORES &&
    typeof value.playerId === "string" &&
    isScoreFilter(value.filter) &&
    (value.selfPlayerId === undefined || typeof value.selfPlayerId === "string")
  );
}

export function isSyncPlayerScoresResponse(value: unknown): value is SyncPlayerScoresResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return isSyncResult(value.result);
  }
  return typeof value.error === "string";
}

export function isGetCachedScoresResponse(value: unknown): value is GetCachedScoresResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return Array.isArray(value.scores) && typeof value.matchedCount === "number" && typeof value.cachedCount === "number";
  }
  return typeof value.error === "string";
}

function isSyncResult(value: unknown): value is SyncPlayerScoresResult {
  return (
    isRecord(value) &&
    typeof value.playerId === "string" &&
    typeof value.playerName === "string" &&
    typeof value.pagesFetched === "number" &&
    typeof value.totalPages === "number" &&
    typeof value.inserted === "number" &&
    typeof value.updated === "number" &&
    typeof value.cachedCount === "number" &&
    typeof value.stoppedEarly === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
