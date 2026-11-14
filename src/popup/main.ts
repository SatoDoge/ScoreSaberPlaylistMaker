import "bootstrap/dist/css/bootstrap.min.css";
import { mountMapList, setCollectedMaps, setMapExcluded, setMapExcludeHandler, setMapListEmptyText } from "./map-list";
import { readScoreFilter } from "./read-filter";
import "./style.css";
import {
  GET_CACHED_SCORES,
  SYNC_PLAYER_SCORES,
  isGetCachedScoresResponse,
  isSyncFailedMessage,
  isSyncFinishedMessage,
  isSyncPlayerScoresResponse,
  isSyncProgressMessage,
  type GetCachedScoresMessage,
  type SyncPlayerScoresMessage,
  type SyncPlayerScoresResult,
} from "../shared/messages";
import type { ScoreFilter } from "../shared/score-filter";
import { blobToBase64 } from "../shared/image-data";
import { playerAvatarBase64 } from "../shared/player-avatar";
import { readCustomPlaylistImage, savePlaylistToDirectory } from "../shared/playlist-files";
import { readPlaylistSettings, readSavedPlayerId, type PlaylistImageMode } from "../shared/player-settings";
import { buildPlaylist, describePlaylist, playlistFileName } from "../shared/playlist";
import { playerIdFromUrl, type CollectedMap } from "../shared/scoresaber";
import { downloadJson } from "./download-json";

const mapList = document.querySelector<HTMLElement>("#mapList");
if (mapList) {
  mapList.setAttribute("role", "list");
  mountMapList(mapList);
}

const unrankedInput = document.querySelector<HTMLInputElement>("#enableUnranked");
const lockedRows = [
  document.querySelector<HTMLElement>('[data-filter="star"]'),
  document.querySelector<HTMLElement>('[data-filter="pp"]'),
];
const filtersPanel = document.querySelector<HTMLElement>(".filters");
const toggleFilters = document.querySelector<HTMLButtonElement>("#toggleFilters");
const openSettings = document.querySelector<HTMLButtonElement>("#openSettings");
const applyButton = document.querySelector<HTMLButtonElement>("#aceptFilter");
const createButton = document.querySelector<HTMLButtonElement>("#createPlaylist");
const progress = document.querySelector<HTMLElement>("#progress");
const playlistNameInput = document.querySelector<HTMLInputElement>("#playlistName");

let watchedPlayerId: string | null = null;
let listedPlayerId: string | null = null;
let progressKind: "self" | "target" = "target";
let syncWait: {
  playerId: string;
  resolve: (result: SyncPlayerScoresResult) => void;
  reject: (error: Error) => void;
} | null = null;
let activeFilter: ScoreFilter = { unrankedOnly: false, noFailOnly: false };
let shownMaps: CollectedMap[] = [];
const excludedKeys = new Set<string>();

for (const row of document.querySelectorAll<HTMLElement>(".filter-row")) {
  row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.addEventListener("change", () => {
    syncFilterInputs(row);
  });
  syncFilterInputs(row);
}

unrankedInput?.addEventListener("change", () => {
  const locked = unrankedInput.checked;
  for (const row of lockedRows) {
    if (!row) {
      continue;
    }
    row.classList.toggle("is-locked", locked);
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (checkbox) {
      checkbox.disabled = locked;
      if (locked) {
        checkbox.checked = false;
      }
    }
    syncFilterInputs(row);
  }
});

openSettings?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

toggleFilters?.addEventListener("click", () => {
  const collapsed = filtersPanel?.classList.toggle("is-collapsed") ?? false;
  toggleFilters.setAttribute("aria-expanded", String(!collapsed));
  toggleFilters.setAttribute("aria-label", collapsed ? "フィルタを表示" : "フィルタを折りたたむ");
});

applyButton?.addEventListener("click", () => {
  void applyFilters();
});

void refreshSelfCompare();

createButton?.addEventListener("click", () => {
  void createPlaylist();
});

setMapExcludeHandler((index) => {
  toggleExcludedMap(index);
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isSyncProgressMessage(message) && message.playerId === watchedPlayerId) {
    const label = progressKind === "self" ? "自分のスコアを更新中" : "取得中";
    setProgress(`${label} ${message.page}/${message.totalPages}（新規 ${message.inserted} / 更新 ${message.updated}）`);
    return;
  }
  if (!syncWait) {
    return;
  }
  if (isSyncFinishedMessage(message) && message.result.playerId === syncWait.playerId) {
    const wait = syncWait;
    syncWait = null;
    wait.resolve(message.result);
    return;
  }
  if (isSyncFailedMessage(message) && message.playerId === syncWait.playerId) {
    const wait = syncWait;
    syncWait = null;
    wait.reject(new Error(message.error));
  }
});

async function applyFilters(): Promise<void> {
  const parsed = readScoreFilter();
  if (!parsed.ok) {
    setProgress(parsed.error);
    return;
  }
  activeFilter = parsed.filter;

  setApplyEnabled(false);
  setProgress("スコアを取得しています");

  try {
    const playerId = await readActivePlayerId();
    if (!playerId) {
      setProgress("プレイヤーページを開いてください");
      return;
    }
    const selfId = await readOptionalPlayerId();
    if (selfId && selfId !== playerId) {
      progressKind = "self";
      setProgress("自分のスコアを更新しています");
      await syncPlayer(selfId);
    }
    progressKind = "target";
    setProgress("スコアを取得しています");
    const result = await syncPlayer(playerId);
    await showSyncedScores(result, selfId && selfId !== playerId ? selfId : undefined);
  } catch (error) {
    setProgress(error instanceof Error ? error.message : "取得に失敗しました");
  } finally {
    setApplyEnabled(true);
  }
}

async function syncPlayer(playerId: string): Promise<SyncPlayerScoresResult> {
  watchedPlayerId = playerId;
  const message: SyncPlayerScoresMessage = { type: SYNC_PLAYER_SCORES, playerId };
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (!isSyncPlayerScoresResponse(response)) {
    throw new Error("取得結果を解釈できません");
  }
  if (response.ok) {
    return response.result;
  }
  if (response.alreadyRunning) {
    setProgress(progressKind === "self" ? "自分のスコア更新の続きを待っています" : "取得の続きを待っています");
    return new Promise((resolve, reject) => {
      syncWait = { playerId, resolve, reject };
    });
  }
  throw new Error(response.error);
}

async function readActivePlayerId(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return playerIdFromUrl(tab?.url ?? "");
}

async function readOptionalPlayerId(): Promise<string | null> {
  try {
    return await readSavedPlayerId();
  } catch {
    return null;
  }
}

async function refreshSelfCompare(): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>("#selfCompare");
  if (!select) {
    return;
  }
  const selfId = await readOptionalPlayerId();
  let activeId: string | null = null;
  try {
    activeId = await readActivePlayerId();
  } catch {
    activeId = null;
  }
  const enabled = selfId !== null && activeId !== null && selfId !== activeId;
  select.disabled = !enabled;
  if (!enabled) {
    select.value = "";
  }
  select.title = enabled ? "自分のスコアと比べて絞り込みます" : "自分のIDを保存し、他の人のページで使えます";
}

async function showSyncedScores(result: SyncPlayerScoresResult, selfPlayerId?: string): Promise<void> {
  if (playlistNameInput && playlistNameInput.value.trim() === "" && result.playerName) {
    playlistNameInput.value = result.playerName;
  }
  const message: GetCachedScoresMessage = {
    type: GET_CACHED_SCORES,
    playerId: result.playerId,
    filter: activeFilter,
    ...(selfPlayerId ? { selfPlayerId } : {}),
  };
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (!isGetCachedScoresResponse(response) || !response.ok) {
    setProgress(isGetCachedScoresResponse(response) && !response.ok ? response.error : "キャッシュを読めません");
    return;
  }
  excludedKeys.clear();
  setMapExcluded((map) => excludedKeys.has(mapKey(map)));
  shownMaps = response.scores;
  listedPlayerId = result.playerId;
  setMapListEmptyText(response.scores.length === 0 ? "条件に一致する譜面はありません" : "適用すると、ここに譜面が表示されます。");
  setCollectedMaps(shownMaps);
  const shown =
    response.matchedCount === response.scores.length
      ? `${response.scores.length}件`
      : `${response.matchedCount}件中 ${response.scores.length}件`;
  setProgress(`該当 ${shown} / キャッシュ ${response.cachedCount}件（新規 ${result.inserted} / 更新 ${result.updated}）`);
}

async function createPlaylist(): Promise<void> {
  const title = playlistNameInput?.value.trim() ?? "";
  if (!title) {
    setProgress("プレイリスト名を入力してください");
    return;
  }
  const playlistMaps = shownMaps.filter((map) => !excludedKeys.has(mapKey(map)));
  if (playlistMaps.length === 0) {
    setProgress("作成する譜面がありません");
    return;
  }
  if (createButton) {
    createButton.disabled = true;
  }
  setProgress("プレイリストを作成しています");
  try {
    const playlist = buildPlaylist(title, playlistMaps);
    if (playlist.songs.length === 0) {
      setProgress("プレイリストにできる譜面がありません");
      return;
    }
    const settings = await readPlaylistSettings();
    const image = await resolvePlaylistImage(settings.imageMode);
    if (image) {
      playlist.image = image;
    }
    const count = describePlaylist(playlistMaps, playlist);
    if (settings.saveMode === "directory") {
      const folder = await savePlaylistToDirectory(playlistFileName(title), JSON.stringify(playlist, null, 2));
      setProgress(`「${folder}」にプレイリストを保存しました（${count}）`);
      return;
    }
    downloadJson(playlistFileName(title), playlist);
    setProgress(`プレイリストを作成しました（${count}）`);
  } catch (error) {
    setProgress(error instanceof Error ? error.message : "プレイリストを作成できません");
  } finally {
    if (createButton) {
      createButton.disabled = false;
    }
  }
}

function toggleExcludedMap(index: number): void {
  const map = shownMaps[index];
  if (!map) {
    return;
  }
  const key = mapKey(map);
  if (excludedKeys.has(key)) {
    excludedKeys.delete(key);
  } else {
    excludedKeys.add(key);
  }
  setMapExcluded((item) => excludedKeys.has(mapKey(item)));
}

function mapKey(map: CollectedMap): string {
  return map.leaderboardUrl || `${map.hash}:${map.characteristic}:${map.difficultyName}:${map.acc}:${map.pp}`;
}

async function resolvePlaylistImage(imageMode: PlaylistImageMode): Promise<string | undefined> {
  if (imageMode === "none") {
    return undefined;
  }
  if (imageMode === "author") {
    if (!listedPlayerId) {
      throw new Error("プレイヤーの譜面を表示してから作成してください");
    }
    return playerAvatarBase64(listedPlayerId);
  }
  const image = await readCustomPlaylistImage();
  if (!image) {
    throw new Error("プレイリスト画像を設定してください");
  }
  return blobToBase64(image);
}

function setProgress(text: string): void {
  if (progress) {
    progress.textContent = text;
  }
}

function setApplyEnabled(enabled: boolean): void {
  if (applyButton) {
    applyButton.disabled = !enabled;
  }
}

function syncFilterInputs(row: HTMLElement): void {
  const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const enabled = checkbox?.checked === true && checkbox.disabled !== true;
  for (const field of row.querySelectorAll<HTMLInputElement>('input[type="text"]')) {
    field.disabled = !enabled;
  }
}
