import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";
import { clearScoreCache, scoreCacheSize } from "../background/score-db";
import { resizeImageBlob } from "../shared/image-data";
import {
  readCustomPlaylistImage,
  readPlaylistDirectory,
  writeCustomPlaylistImage,
  writePlaylistDirectory,
} from "../shared/playlist-files";
import {
  parsePlayerIdInput,
  readPlaylistSettings,
  readSavedPlayerId,
  writePlaylistImageMode,
  writePlaylistSaveMode,
  writeSavedPlayerId,
  type PlaylistImageMode,
  type PlaylistSaveMode,
} from "../shared/player-settings";

const playerIdInput = document.querySelector<HTMLInputElement>("#playerId");
const saveIdButton = document.querySelector<HTMLButtonElement>("#saveId");
const idStatus = document.querySelector<HTMLElement>("#idStatus");
const clearCacheButton = document.querySelector<HTMLButtonElement>("#clearCache");
const cacheStatus = document.querySelector<HTMLElement>("#cacheStatus");
const imageModeInputs = document.querySelectorAll<HTMLInputElement>('input[name="imageMode"]');
const authorFields = document.querySelector<HTMLElement>("#authorFields");
const customImageFields = document.querySelector<HTMLElement>("#customImageFields");
const customImageInput = document.querySelector<HTMLInputElement>("#customImage");
const imagePreview = document.querySelector<HTMLImageElement>("#imagePreview");
const saveImageButton = document.querySelector<HTMLButtonElement>("#saveImage");
const imageStatus = document.querySelector<HTMLElement>("#imageStatus");
const saveModeInputs = document.querySelectorAll<HTMLInputElement>('input[name="saveMode"]');
const directoryFields = document.querySelector<HTMLElement>("#directoryFields");
const directoryName = document.querySelector<HTMLElement>("#directoryName");
const pickDirectoryButton = document.querySelector<HTMLButtonElement>("#pickDirectory");
const saveMethodButton = document.querySelector<HTMLButtonElement>("#saveMethod");
const saveStatus = document.querySelector<HTMLElement>("#saveStatus");

let pendingImage: Blob | null = null;
let previewUrl: string | null = null;

saveIdButton?.addEventListener("click", () => {
  void savePlayerId();
});
clearCacheButton?.addEventListener("click", () => {
  void clearCache();
});
saveImageButton?.addEventListener("click", () => {
  void saveImageSettings();
});
saveMethodButton?.addEventListener("click", () => {
  void saveMethodSettings();
});
pickDirectoryButton?.addEventListener("click", () => {
  void pickDirectory();
});
customImageInput?.addEventListener("change", () => {
  void previewSelectedImage();
});
for (const input of imageModeInputs) {
  input.addEventListener("change", () => {
    syncImageFields();
  });
}
for (const input of saveModeInputs) {
  input.addEventListener("change", () => {
    syncSaveFields();
  });
}

void loadSettings();

async function loadSettings(): Promise<void> {
  await Promise.all([loadSavedPlayerId(), loadCacheSize(), loadImageSettings(), loadSaveSettings()]);
}

async function loadSavedPlayerId(): Promise<void> {
  try {
    const playerId = await readSavedPlayerId();
    if (!playerId || !playerIdInput) {
      setStatus(idStatus, "IDはまだ保存されていません");
      return;
    }
    playerIdInput.value = playerId;
    setStatus(idStatus, "保存済みのIDを読み込みました");
  } catch (error) {
    setStatus(idStatus, error instanceof Error ? error.message : "設定を読めません", true);
  }
}

async function savePlayerId(): Promise<void> {
  const playerId = parsePlayerIdInput(playerIdInput?.value ?? "");
  if (!playerId) {
    setStatus(idStatus, "ScoreSaberのIDを入力してください", true);
    return;
  }
  if (saveIdButton) {
    saveIdButton.disabled = true;
  }
  try {
    await writeSavedPlayerId(playerId);
    if (playerIdInput) {
      playerIdInput.value = playerId;
    }
    setStatus(idStatus, "IDを保存しました");
  } catch (error) {
    setStatus(idStatus, error instanceof Error ? error.message : "IDを保存できません", true);
  } finally {
    if (saveIdButton) {
      saveIdButton.disabled = false;
    }
  }
}

async function loadCacheSize(): Promise<void> {
  try {
    const size = await scoreCacheSize();
    setStatus(cacheStatus, `現在のキャッシュ: スコア ${size.scores}件`);
  } catch (error) {
    setStatus(cacheStatus, error instanceof Error ? error.message : "キャッシュを読めません", true);
  }
}

async function clearCache(): Promise<void> {
  let size: { scores: number; players: number };
  try {
    size = await scoreCacheSize();
  } catch (error) {
    setStatus(cacheStatus, error instanceof Error ? error.message : "キャッシュを読めません", true);
    return;
  }
  if (size.scores === 0 && size.players === 0) {
    setStatus(cacheStatus, "削除するキャッシュはありません");
    return;
  }
  const confirmed = window.confirm(
    `スコア ${size.scores}件のキャッシュを削除しますか？\nID、プレイリスト画像、保存先フォルダは残ります。`,
  );
  if (!confirmed) {
    return;
  }
  if (clearCacheButton) {
    clearCacheButton.disabled = true;
  }
  try {
    await clearScoreCache();
    setStatus(cacheStatus, `キャッシュを削除しました（スコア ${size.scores}件）`);
  } catch (error) {
    setStatus(cacheStatus, error instanceof Error ? error.message : "キャッシュを削除できません", true);
  } finally {
    if (clearCacheButton) {
      clearCacheButton.disabled = false;
    }
  }
}

async function loadImageSettings(): Promise<void> {
  try {
    const settings = await readPlaylistSettings();
    checkMode("imageMode", settings.imageMode);
    syncImageFields();
    const stored = await readCustomPlaylistImage();
    if (stored) {
      showImagePreview(stored);
    }
    setStatus(imageStatus, "画像設定を読み込みました");
  } catch (error) {
    setStatus(imageStatus, error instanceof Error ? error.message : "画像設定を読めません", true);
  }
}

async function previewSelectedImage(): Promise<void> {
  const file = customImageInput?.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    pendingImage = null;
    setStatus(imageStatus, "画像ファイルを選んでください", true);
    return;
  }
  try {
    pendingImage = await resizeImageBlob(file);
    showImagePreview(pendingImage);
    setStatus(imageStatus, "この画像は「画像設定を保存」で保存されます");
  } catch (error) {
    pendingImage = null;
    setStatus(imageStatus, error instanceof Error ? error.message : "画像を処理できません", true);
  }
}

async function saveImageSettings(): Promise<void> {
  const imageMode = selectedImageMode();
  if (imageMode === "custom" && !pendingImage) {
    const stored = await readCustomPlaylistImage().catch(() => undefined);
    if (!stored) {
      setStatus(imageStatus, "画像ファイルを選んでください", true);
      return;
    }
  }
  if (saveImageButton) {
    saveImageButton.disabled = true;
  }
  try {
    if (imageMode === "custom" && pendingImage) {
      await writeCustomPlaylistImage(pendingImage);
      pendingImage = null;
    }
    await writePlaylistImageMode(imageMode);
    setStatus(imageStatus, "画像設定を保存しました");
  } catch (error) {
    setStatus(imageStatus, error instanceof Error ? error.message : "画像設定を保存できません", true);
  } finally {
    if (saveImageButton) {
      saveImageButton.disabled = false;
    }
  }
}

async function loadSaveSettings(): Promise<void> {
  try {
    const settings = await readPlaylistSettings();
    checkMode("saveMode", settings.saveMode);
    syncSaveFields();
    await showDirectoryName();
    setStatus(saveStatus, "保存方法を読み込みました");
  } catch (error) {
    setStatus(saveStatus, error instanceof Error ? error.message : "保存方法を読めません", true);
  }
}

async function saveMethodSettings(): Promise<void> {
  const saveMode = selectedSaveMode();
  if (saveMode === "directory") {
    const directory = await readPlaylistDirectory().catch(() => undefined);
    if (!directory) {
      setStatus(saveStatus, "先にフォルダを選択してください", true);
      return;
    }
  }
  if (saveMethodButton) {
    saveMethodButton.disabled = true;
  }
  try {
    await writePlaylistSaveMode(saveMode);
    setStatus(saveStatus, saveMode === "directory" ? "指定したフォルダへの保存を設定しました" : "ダウンロードする設定を保存しました");
  } catch (error) {
    setStatus(saveStatus, error instanceof Error ? error.message : "保存方法を保存できません", true);
  } finally {
    if (saveMethodButton) {
      saveMethodButton.disabled = false;
    }
  }
}

async function pickDirectory(): Promise<void> {
  if (!("showDirectoryPicker" in window)) {
    setStatus(saveStatus, "この環境ではフォルダを選択できません", true);
    return;
  }
  let directory: FileSystemDirectoryHandle;
  try {
    directory = await window.showDirectoryPicker({ id: "playlist-directory", mode: "readwrite" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      setStatus(saveStatus, "フォルダの選択をキャンセルしました");
      return;
    }
    setStatus(saveStatus, "フォルダを選択できません", true);
    return;
  }
  if (pickDirectoryButton) {
    pickDirectoryButton.disabled = true;
  }
  try {
    await writePlaylistDirectory(directory);
    await writePlaylistSaveMode("directory");
    checkMode("saveMode", "directory");
    syncSaveFields();
    if (directoryName) {
      directoryName.textContent = `保存先: ${directory.name}`;
    }
    setStatus(saveStatus, `フォルダ「${directory.name}」を保存しました。次回からも同じ場所に書き出します`);
  } catch (error) {
    setStatus(saveStatus, error instanceof Error ? error.message : "フォルダを保存できません", true);
  } finally {
    if (pickDirectoryButton) {
      pickDirectoryButton.disabled = false;
    }
  }
}

function syncImageFields(): void {
  if (authorFields) {
    authorFields.hidden = selectedImageMode() !== "author";
  }
  if (customImageFields) {
    customImageFields.hidden = selectedImageMode() !== "custom";
  }
}

function syncSaveFields(): void {
  if (directoryFields) {
    directoryFields.hidden = selectedSaveMode() !== "directory";
  }
}

function showImagePreview(blob: Blob): void {
  if (!imagePreview) {
    return;
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = URL.createObjectURL(blob);
  imagePreview.src = previewUrl;
  imagePreview.hidden = false;
}

async function showDirectoryName(): Promise<void> {
  const directory = await readPlaylistDirectory();
  if (directoryName) {
    directoryName.textContent = directory ? `保存先: ${directory.name}` : "保存先: 未設定";
  }
}

function selectedImageMode(): PlaylistImageMode {
  const selected = document.querySelector<HTMLInputElement>('input[name="imageMode"]:checked');
  if (selected?.value === "author" || selected?.value === "custom") {
    return selected.value;
  }
  return "none";
}

function selectedSaveMode(): PlaylistSaveMode {
  const selected = document.querySelector<HTMLInputElement>('input[name="saveMode"]:checked');
  return selected?.value === "directory" ? "directory" : "download";
}

function checkMode(name: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (input) {
    input.checked = true;
  }
}

function setStatus(element: HTMLElement | null, text: string, isError = false): void {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.classList.toggle("text-danger", isError);
  element.classList.toggle("text-secondary", !isError);
}
