import { playerIdFromUrl } from "./scoresaber";

const PLAYER_ID_KEY = "playerId";

export async function readSavedPlayerId(): Promise<string | null> {
  const stored = await localSettings().get(PLAYER_ID_KEY);
  const value = stored[PLAYER_ID_KEY];
  return isPlayerId(value) ? value : null;
}

export async function writeSavedPlayerId(playerId: string): Promise<void> {
  await localSettings().set({ [PLAYER_ID_KEY]: playerId });
}

function localSettings(): chrome.storage.LocalStorageArea {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("設定を保存できません");
  }
  return chrome.storage.local;
}

export function parsePlayerIdInput(value: string): string | null {
  const trimmed = value.trim();
  if (isPlayerId(trimmed)) {
    return trimmed;
  }
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const playerId = playerIdFromUrl(url);
  return isPlayerId(playerId) ? playerId : null;
}

function isPlayerId(value: unknown): value is string {
  return typeof value === "string" && /^\d{16,20}$/.test(value);
}

const IMAGE_MODE_KEY = "playlistImageMode";
const SAVE_MODE_KEY = "playlistSaveMode";
const IMAGE_MODES = ["none", "author", "custom"] as const;
const SAVE_MODES = ["download", "directory"] as const;

export type PlaylistImageMode = (typeof IMAGE_MODES)[number];
export type PlaylistSaveMode = (typeof SAVE_MODES)[number];

export interface PlaylistSettings {
  imageMode: PlaylistImageMode;
  saveMode: PlaylistSaveMode;
}

export async function readPlaylistSettings(): Promise<PlaylistSettings> {
  const stored = await localSettings().get([IMAGE_MODE_KEY, SAVE_MODE_KEY]);
  return {
    imageMode: isImageMode(stored[IMAGE_MODE_KEY]) ? stored[IMAGE_MODE_KEY] : "none",
    saveMode: isSaveMode(stored[SAVE_MODE_KEY]) ? stored[SAVE_MODE_KEY] : "download",
  };
}

export async function writePlaylistImageMode(imageMode: PlaylistImageMode): Promise<void> {
  await localSettings().set({ [IMAGE_MODE_KEY]: imageMode });
}

export async function writePlaylistSaveMode(saveMode: PlaylistSaveMode): Promise<void> {
  await localSettings().set({ [SAVE_MODE_KEY]: saveMode });
}

function isImageMode(value: unknown): value is PlaylistImageMode {
  return typeof value === "string" && IMAGE_MODES.includes(value as PlaylistImageMode);
}

function isSaveMode(value: unknown): value is PlaylistSaveMode {
  return typeof value === "string" && SAVE_MODES.includes(value as PlaylistSaveMode);
}
