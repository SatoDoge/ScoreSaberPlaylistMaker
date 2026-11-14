import { readPlayerScores } from "./score-db";
import { SyncAlreadyRunningError, syncPlayerScores } from "./sync-scores";
import {
  isGetCachedScoresMessage,
  isSyncPlayerScoresMessage,
  type GetCachedScoresResponse,
  type SyncPlayerScoresResponse,
} from "../shared/messages";
import { filterScores } from "../shared/score-filter";
import { scoreCreatedAt, toCollectedMap, type OwnScore } from "../shared/scoresaber";

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[ScoreSaber Playlist Maker]", details.reason);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isSyncPlayerScoresMessage(message)) {
    void syncPlayerScores(message.playerId)
      .then((result) => {
        const response: SyncPlayerScoresResponse = { ok: true, result };
        reply(sendResponse, response);
      })
      .catch((error: unknown) => {
        const response: SyncPlayerScoresResponse = {
          ok: false,
          error: error instanceof Error ? error.message : "取得に失敗しました",
          alreadyRunning: error instanceof SyncAlreadyRunningError,
        };
        reply(sendResponse, response);
      });
    return true;
  }

  if (isGetCachedScoresMessage(message)) {
    const selfPlayerId =
      message.selfPlayerId && message.selfPlayerId !== message.playerId ? message.selfPlayerId : undefined;
    void Promise.all([readPlayerScores(message.playerId), readOwnScores(selfPlayerId)])
      .then(([scores, ownScores]) => {
        const sorted = scores.sort((left, right) => scoreCreatedAt(right) - scoreCreatedAt(left));
        const selected = filterScores(sorted, message.filter, ownScores);
        const response: GetCachedScoresResponse = {
          ok: true,
          scores: selected.shown.map((record) => {
            const map = toCollectedMap(record);
            const mine = ownScores.get(record.leaderboard.id);
            return mine ? { ...map, mine } : map;
          }),
          matchedCount: selected.matched.length,
          cachedCount: sorted.length,
        };
        reply(sendResponse, response);
      })
      .catch((error: unknown) => {
        const response: GetCachedScoresResponse = {
          ok: false,
          error: error instanceof Error ? error.message : "キャッシュを読めません",
        };
        reply(sendResponse, response);
      });
    return true;
  }

  return undefined;
});

async function readOwnScores(playerId: string | undefined): Promise<Map<number, OwnScore>> {
  const ownScores = new Map<number, OwnScore>();
  if (!playerId) {
    return ownScores;
  }
  for (const record of await readPlayerScores(playerId)) {
    const map = toCollectedMap(record);
    ownScores.set(record.leaderboard.id, { acc: map.acc, mod: map.mod, pp: map.pp });
  }
  return ownScores;
}

function reply(sendResponse: (response: unknown) => void, response: unknown): void {
  try {
    sendResponse(response);
  } catch {
    // ポップアップが閉じたあとに返しても届かない。
  }
}
