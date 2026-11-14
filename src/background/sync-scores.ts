import {
  countPlayerScores,
  readPlayerSync,
  writePlayerSync,
  writeScorePage,
} from "./score-db";
import {
  SCORE_PAGE_SIZE,
  parseScorePage,
  scoresPageUrl,
  type ScoreSaberScorePage,
} from "../shared/scoresaber";
import {
  SYNC_FAILED,
  SYNC_FINISHED,
  SYNC_PROGRESS,
  type SyncFailedMessage,
  type SyncFinishedMessage,
  type SyncPlayerScoresResult,
  type SyncProgressMessage,
} from "../shared/messages";

const runningPlayers = new Set<string>();

export async function syncPlayerScores(playerId: string): Promise<SyncPlayerScoresResult> {
  if (runningPlayers.has(playerId)) {
    throw new SyncAlreadyRunningError();
  }

  runningPlayers.add(playerId);
  const keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, 20_000);

  try {
    const state = await readPlayerSync(playerId);
    const cacheIsComplete = state?.complete === true;
    let page = 1;
    let totalPages = 1;
    let totalItems = state?.totalItems ?? 0;
    let inserted = 0;
    let updated = 0;
    let pagesFetched = 0;
    let stoppedEarly = false;
    let finishedAllPages = false;
    let playerName = "";

    while (page <= totalPages) {
      const body = await fetchScorePage(playerId, page);
      pagesFetched += 1;
      if (page === 1) {
        totalPages = Math.max(1, body.metadata.totalPages);
        totalItems = body.metadata.totalItems;
      }
      const firstNamed = body.data.find((score) => score.score.player?.name);
      if (!playerName && firstNamed?.score.player?.name) {
        playerName = firstNamed.score.player.name;
      }

      // recent 順なので、完了済みキャッシュと同じか古い譜面に当たったら残りは取得済み。
      const written = await writeScorePage(playerId, body.data, cacheIsComplete);
      inserted += written.inserted;
      updated += written.updated;
      publishProgress({
        type: SYNC_PROGRESS,
        playerId,
        page,
        totalPages,
        inserted,
        updated,
      });

      if (written.stop) {
        stoppedEarly = true;
        break;
      }
      if (body.data.length < SCORE_PAGE_SIZE) {
        finishedAllPages = true;
        break;
      }
      page += 1;
    }
    if (page > totalPages) {
      finishedAllPages = true;
    }

    await writePlayerSync({
      playerId,
      complete: cacheIsComplete || finishedAllPages,
      syncedAt: new Date().toISOString(),
      totalItems,
    });

    const result: SyncPlayerScoresResult = {
      playerId,
      playerName,
      pagesFetched,
      totalPages,
      inserted,
      updated,
      cachedCount: await countPlayerScores(playerId),
      stoppedEarly,
    };
    const finished: SyncFinishedMessage = { type: SYNC_FINISHED, result };
    await publish(finished);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得に失敗しました";
    const failed: SyncFailedMessage = { type: SYNC_FAILED, playerId, error: message };
    await publish(failed);
    throw error;
  } finally {
    clearInterval(keepAlive);
    runningPlayers.delete(playerId);
  }
}

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("すでに取得中です");
    this.name = "SyncAlreadyRunningError";
  }
}

async function fetchScorePage(playerId: string, page: number): Promise<ScoreSaberScorePage> {
  const url = scoresPageUrl(playerId, page);
  let lastStatus = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url);
    if (response.status === 429 || response.status >= 500) {
      lastStatus = response.status;
      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
      await delay(waitMs);
      continue;
    }
    if (!response.ok) {
      throw new Error(`ScoreSaber API が ${response.status} を返しました`);
    }
    const json: unknown = await response.json();
    const pageData = parseScorePage(json);
    if (!pageData) {
      throw new Error("ScoreSaber API の応答形式が不正です");
    }
    return pageData;
  }

  throw new Error(`ScoreSaber API が ${lastStatus} を返したため取得を中断しました`);
}

function publishProgress(message: SyncProgressMessage): void {
  void publish(message);
}

async function publish(
  message: SyncProgressMessage | SyncFinishedMessage | SyncFailedMessage,
): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // ポップアップを閉じている間は届かなくてよい。
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
