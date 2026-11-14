import type { CollectedMap } from "./scoresaber";

export interface BeatSaberPlaylist {
  playlistTitle: string;
  playlistAuthor: string;
  playlistDescription: string;
  image?: string;
  songs: PlaylistSong[];
}

interface PlaylistSong {
  songName: string;
  levelAuthorName: string;
  hash: string;
  levelid: string;
  difficulties: {
    characteristic: string;
    name: string;
  }[];
}

export function buildPlaylist(title: string, maps: readonly CollectedMap[], image?: string): BeatSaberPlaylist {
  return {
    playlistTitle: title,
    playlistAuthor: "プレイリスト作成くん",
    playlistDescription: "プレイリスト作成くんによって作成されたプレイリストです",
    ...(image ? { image } : {}),
    songs: groupSongs(maps),
  };
}

export function describePlaylist(maps: readonly CollectedMap[], playlist: BeatSaberPlaylist): string {
  const charts = playlist.songs.reduce((sum, song) => sum + song.difficulties.length, 0);
  const missingHash = maps.filter((map) => !map.hash).length;
  const summary = playlist.songs.length === charts ? `${playlist.songs.length}曲` : `${playlist.songs.length}曲（${charts}譜面）`;
  return missingHash > 0 ? `${summary}、${missingHash}件はハッシュがないため除外` : summary;
}

function groupSongs(maps: readonly CollectedMap[]): PlaylistSong[] {
  const songs: PlaylistSong[] = [];
  const byHash = new Map<string, PlaylistSong>();
  for (const map of maps) {
    if (!map.hash) {
      continue;
    }
    let song = byHash.get(map.hash);
    if (!song) {
      song = {
        songName: map.name,
        levelAuthorName: map.levelOtherName,
        hash: map.hash,
        levelid: `custom_level_${map.hash}`,
        difficulties: [],
      };
      byHash.set(map.hash, song);
      songs.push(song);
    }
    const exists = song.difficulties.some(
      (difficulty) => difficulty.characteristic === map.characteristic && difficulty.name === map.difficultyName,
    );
    if (!exists) {
      song.difficulties.push({ characteristic: map.characteristic, name: map.difficultyName });
    }
  }
  return songs;
}

export function playlistFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return `${safe || "プレイリスト"}.json`;
}
