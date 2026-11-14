import { blobToBase64, resizeImageBlob } from "./image-data";

export function playerAvatarUrl(playerId: string): string {
  return `https://cdn.scoresaber.com/avatars/${encodeURIComponent(playerId)}.jpg`;
}

export async function playerAvatarBase64(playerId: string): Promise<string> {
  const response = await fetch(playerAvatarUrl(playerId));
  if (!response.ok) {
    throw new Error("プレイヤーのアイコンを取得できません");
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("プレイヤーのアイコンを取得できません");
  }
  return blobToBase64(await resizeImageBlob(blob));
}
