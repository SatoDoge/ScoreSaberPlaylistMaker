import {
  isScoreRecord,
  scoreWriteAction,
  shouldStopPaging,
  type ScoreSaberScoreRecord,
  type ScoreWrite,
} from "../shared/scoresaber";

const DB_NAME = "scoresaber-playlist-maker";
const DB_VERSION = 1;
const SCORE_STORE = "scores";
const PLAYER_STORE = "playerSync";

export interface PlayerSyncState {
  playerId: string;
  complete: boolean;
  syncedAt: string;
  totalItems: number;
}

export interface PageWriteResult {
  inserted: number;
  updated: number;
  stop: boolean;
}

let databasePromise: Promise<IDBDatabase> | null = null;

export function openScoreDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCORE_STORE)) {
        db.createObjectStore(SCORE_STORE);
      }
      if (!db.objectStoreNames.contains(PLAYER_STORE)) {
        db.createObjectStore(PLAYER_STORE, { keyPath: "playerId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("IndexedDB を開けません"));
    };
  });
  return databasePromise;
}

export async function readPlayerSync(playerId: string): Promise<PlayerSyncState | undefined> {
  const db = await openScoreDatabase();
  return requestResult<PlayerSyncState | undefined>(
    db.transaction(PLAYER_STORE, "readonly").objectStore(PLAYER_STORE).get(playerId),
  );
}

export async function writePlayerSync(state: PlayerSyncState): Promise<void> {
  const db = await openScoreDatabase();
  await requestResult(db.transaction(PLAYER_STORE, "readwrite").objectStore(PLAYER_STORE).put(state));
}

export async function scoreCacheSize(): Promise<{ scores: number; players: number }> {
  const db = await openScoreDatabase();
  const scores = await requestResult<number>(db.transaction(SCORE_STORE, "readonly").objectStore(SCORE_STORE).count());
  const players = await requestResult<number>(db.transaction(PLAYER_STORE, "readonly").objectStore(PLAYER_STORE).count());
  return { scores, players };
}

export async function clearScoreCache(): Promise<void> {
  const db = await openScoreDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SCORE_STORE, PLAYER_STORE], "readwrite");
    tx.objectStore(SCORE_STORE).clear();
    tx.objectStore(PLAYER_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("キャッシュを削除できません"));
    tx.onabort = () => reject(tx.error ?? new Error("キャッシュを削除できません"));
  });
}

export async function countPlayerScores(playerId: string): Promise<number> {
  const db = await openScoreDatabase();
  return requestResult<number>(
    db.transaction(SCORE_STORE, "readonly").objectStore(SCORE_STORE).count(playerKeyRange(playerId)),
  );
}

export async function readPlayerScores(playerId: string): Promise<ScoreSaberScoreRecord[]> {
  const db = await openScoreDatabase();
  const stored = await requestResult<unknown[]>(
    db.transaction(SCORE_STORE, "readonly").objectStore(SCORE_STORE).getAll(playerKeyRange(playerId)),
  );
  return stored.filter(isScoreRecord);
}

export function writeScorePage(
  playerId: string,
  scores: readonly ScoreSaberScoreRecord[],
  cacheIsComplete: boolean,
): Promise<PageWriteResult> {
  return openScoreDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SCORE_STORE, "readwrite");
        const store = tx.objectStore(SCORE_STORE);
        const result: PageWriteResult = { inserted: 0, updated: 0, stop: false };
        let settled = false;
        let index = 0;

        const finish = (error?: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          if (error) {
            reject(error instanceof Error ? error : new Error("IndexedDB への書き込みに失敗しました"));
            return;
          }
          resolve(result);
        };

        const next = () => {
          const score = scores[index];
          if (!score || result.stop) {
            return;
          }
          index += 1;
          const request = store.get(scoreKey(playerId, score.leaderboard.id));
          request.onsuccess = () => {
            const raw: unknown = request.result;
            const cached = isScoreRecord(raw) ? raw : undefined;
            const action: ScoreWrite =
              raw !== undefined && !cached ? "update" : scoreWriteAction(cached, score);
            if (shouldStopPaging(cacheIsComplete, action)) {
              result.stop = true;
              return;
            }
            if (action === "unchanged") {
              next();
              return;
            }
            const putRequest = store.put(score, scoreKey(playerId, score.leaderboard.id));
            putRequest.onsuccess = () => {
              if (action === "insert") {
                result.inserted += 1;
              } else {
                result.updated += 1;
              }
              next();
            };
          };
        };

        tx.oncomplete = () => finish();
        tx.onerror = (event) => {
          event.preventDefault();
          finish(tx.error);
        };
        tx.onabort = () => finish(tx.error ?? new Error("IndexedDB のトランザクションが中断されました"));
        next();
      }),
  );
}

function playerKeyRange(playerId: string): IDBKeyRange {
  return IDBKeyRange.bound([playerId, 0], [playerId, Number.MAX_SAFE_INTEGER]);
}

function scoreKey(playerId: string, leaderboardId: number): [string, number] {
  return [playerId, leaderboardId];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB の読み取りに失敗しました"));
  });
}
