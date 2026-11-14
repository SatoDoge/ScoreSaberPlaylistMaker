import beatSaverLogo from "./icons/beatsaver-32.png";
import scoreSaberLogo from "./icons/scoresaber.svg";
import type { CollectedMap } from "../shared/scoresaber";

export type { CollectedMap };

const COMPACT_HEIGHT = 64;
const COMPARE_HEIGHT = 108;
const ROW_GAP = 4;
const OVERSCAN = 4;

const DIFFICULTY_COLOR: Record<string, string> = {
  Es: "MediumSeaGreen",
  N: "#59b0f4",
  H: "tomato",
  Ex: "#bf2a42",
  "E+": "#8f48db",
};

interface MapRow {
  root: HTMLDivElement;
  exclude: HTMLButtonElement;
  scoreSaber: HTMLButtonElement;
  beatSaver: HTMLButtonElement;
  rank: HTMLSpanElement;
  img: HTMLImageElement;
  diff: HTMLSpanElement;
  title: HTMLSpanElement;
  artist: HTMLSpanElement;
  acc: HTMLSpanElement;
  pp: HTMLSpanElement;
  mineAcc: HTMLSpanElement;
  minePp: HTMLSpanElement;
  index: number;
}

export function mountMapList(container: HTMLElement): void {
  const empty = document.createElement("p");
  empty.className = "map-empty";
  empty.textContent = "適用すると、ここに譜面が表示されます。";
  emptyMessage = empty;

  const spacer = document.createElement("div");
  spacer.className = "map-spacer";
  spacer.hidden = true;

  const windowEl = document.createElement("div");
  windowEl.className = "map-window";
  spacer.append(windowEl);
  container.replaceChildren(empty, spacer);

  const pool: MapRow[] = [];
  let maps: readonly CollectedMap[] = [];
  let offsets: number[] = [];
  let totalHeight = 0;
  let frame = 0;

  const paint = (): void => {
    if (maps.length === 0) {
      empty.hidden = false;
      spacer.hidden = true;
      windowEl.replaceChildren();
      return;
    }

    empty.hidden = true;
    spacer.hidden = false;
    const start = Math.max(0, rowAt(offsets, container.scrollTop) - OVERSCAN);
    const end = Math.min(maps.length, rowAt(offsets, container.scrollTop + container.clientHeight) + 1 + OVERSCAN);
    spacer.style.height = `${totalHeight}px`;
    windowEl.style.transform = `translateY(${offsets[start] ?? 0}px)`;

    const needed = Math.max(0, end - start);
    while (pool.length < needed) {
      pool.push(createRow());
    }

    const visible: HTMLDivElement[] = [];
    for (let offset = 0; offset < needed; offset += 1) {
      const row = pool[offset];
      if (!row) {
        continue;
      }
      bindRow(row, maps[start + offset], start + offset);
      visible.push(row.root);
    }
    windowEl.replaceChildren(...visible);
  };

  const schedulePaint = (): void => {
    if (frame !== 0) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
    });
  };

  container.addEventListener("scroll", schedulePaint, { passive: true });
  const observer = new ResizeObserver(schedulePaint);
  observer.observe(container);

  const setMaps = (next: readonly CollectedMap[], keepScroll = false): void => {
    const scrollTop = container.scrollTop;
    maps = next;
    const layout = buildLayout(next);
    offsets = layout.offsets;
    totalHeight = layout.total;
    for (const row of pool) {
      row.index = -1;
    }
    container.scrollTop = keepScroll ? scrollTop : 0;
    paint();
  };

  activeList = setMaps;
  repaint = paint;
  paint();
}

let activeList: ((maps: readonly CollectedMap[], keepScroll?: boolean) => void) | null = null;
let repaint: (() => void) | null = null;
let emptyMessage: HTMLElement | null = null;
let excludeHandler: ((index: number) => void) | null = null;
let isExcluded: (map: CollectedMap) => boolean = () => false;

export function setCollectedMaps(maps: readonly CollectedMap[], keepScroll = false): void {
  activeList?.(maps, keepScroll);
}

export function setMapExcludeHandler(handler: (index: number) => void): void {
  excludeHandler = handler;
}

export function setMapExcluded(predicate: (map: CollectedMap) => boolean): void {
  isExcluded = predicate;
  repaint?.();
}

export function setMapListEmptyText(text: string): void {
  if (emptyMessage) {
    emptyMessage.textContent = text;
  }
}

function createRow(): MapRow {
  const root = document.createElement("div");
  root.className = "map-row";
  root.setAttribute("role", "listitem");

  const links = document.createElement("div");
  links.className = "map-links";
  const scoreSaber = createMapLink("ScoreSaberのリーダーボードを開く", scoreSaberLogo);
  const beatSaver = createMapLink("BeatSaverを開く", beatSaverLogo);
  links.append(scoreSaber, beatSaver);

  const exclude = document.createElement("button");
  exclude.type = "button";
  exclude.className = "map-exclude";
  exclude.title = "この譜面を除外";
  exclude.setAttribute("aria-label", "この譜面を除外");
  exclude.append(excludeIcon());

  const rank = document.createElement("span");
  rank.className = "map-rank";

  const img = document.createElement("img");
  img.className = "map-cover";
  img.alt = "";
  img.decoding = "async";

  const diff = document.createElement("span");
  diff.className = "map-diff";

  const text = document.createElement("div");
  text.className = "map-text";
  const title = document.createElement("span");
  title.className = "map-title";
  const artist = document.createElement("span");
  artist.className = "map-artist";
  text.append(title, artist);

  const scores = document.createElement("div");
  scores.className = "map-scores";
  const acc = document.createElement("span");
  acc.className = "map-acc";
  const pp = document.createElement("span");
  pp.className = "map-pp";
  const versus = document.createElement("span");
  versus.className = "vs-me";
  versus.textContent = "VS me";
  const mineAcc = document.createElement("span");
  mineAcc.className = "map-acc mine-score";
  const minePp = document.createElement("span");
  minePp.className = "map-pp mine-score";
  scores.append(acc, pp, versus, mineAcc, minePp);

  root.append(exclude, rank, img, diff, text, scores, links);
  const row: MapRow = {
    root,
    exclude,
    scoreSaber,
    beatSaver,
    rank,
    img,
    diff,
    title,
    artist,
    acc,
    pp,
    mineAcc,
    minePp,
    index: -1,
  };
  exclude.addEventListener("click", () => {
    if (row.index >= 0) {
      excludeHandler?.(row.index);
    }
  });
  return row;
}

function excludeIcon(): SVGSVGElement {
  return iconSvg(
    '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M4 4l8 8M12 4l-8 8" />',
  );
}

function restoreIcon(): SVGSVGElement {
  return iconSvg(
    '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12.8 6.4a5 5 0 1 1-1.7-2.9"/><path fill="currentColor" d="M10.2 1.1 14.4 3.8l-4 1.8z"/>',
    16,
  );
}

function iconSvg(markup: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = markup;
  return svg;
}

function createMapLink(label: string, icon: string): HTMLButtonElement {
  const link = document.createElement("button");
  link.type = "button";
  link.className = "map-link";
  link.title = label;
  link.setAttribute("aria-label", label);
  link.addEventListener("click", () => {
    const url = link.dataset.url;
    if (url) {
      openBackgroundTab(url);
    }
  });
  const image = document.createElement("img");
  image.src = icon;
  image.alt = "";
  link.append(image);
  return link;
}

function openBackgroundTab(url: string): void {
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    void chrome.tabs.create({ url, active: false });
    return;
  }
  window.open(url, "_blank", "noopener");
}

function bindRow(row: MapRow, map: CollectedMap | undefined, index: number): void {
  if (!map) {
    return;
  }
  applyExcluded(row, isExcluded(map));
  if (row.index === index) {
    return;
  }
  row.index = index;

  if (row.img.dataset.src !== map.picture) {
    row.img.dataset.src = map.picture;
    if (map.picture) {
      row.img.src = map.picture;
    } else {
      row.img.removeAttribute("src");
    }
  }

  setExternalLink(row.scoreSaber, map.leaderboardUrl);
  setExternalLink(row.beatSaver, map.beatSaverUrl);
  row.rank.textContent = `#${index + 1}`;
  row.diff.textContent = map.badge;
  row.diff.style.backgroundColor = DIFFICULTY_COLOR[map.difficulty] ?? "#6c757d";
  row.title.textContent = map.name;
  row.title.title = map.name;
  row.artist.textContent = map.levelOtherName;
  row.acc.textContent = scoreLabel(map.acc, map.mod);
  row.acc.style.backgroundColor = accuracyColor(map.acc);
  row.pp.textContent = `${map.pp}PP`;
  const mine = map.mine;
  row.root.classList.toggle("has-mine", mine !== undefined);
  row.root.style.height = `${mine ? COMPARE_HEIGHT : COMPACT_HEIGHT}px`;
  if (mine) {
    row.mineAcc.textContent = scoreLabel(mine.acc, mine.mod);
    row.mineAcc.style.backgroundColor = accuracyColor(mine.acc);
    row.minePp.textContent = `${mine.pp}PP`;
  }
}

function applyExcluded(row: MapRow, excluded: boolean): void {
  const mode = excluded ? "restore" : "exclude";
  row.root.classList.toggle("is-excluded", excluded);
  if (row.exclude.dataset.mode === mode) {
    return;
  }
  row.exclude.dataset.mode = mode;
  row.exclude.classList.toggle("is-restore", excluded);
  row.exclude.title = excluded ? "除外を解除" : "この譜面を除外";
  row.exclude.setAttribute("aria-label", row.exclude.title);
  row.exclude.replaceChildren(excluded ? restoreIcon() : excludeIcon());
}

function setExternalLink(link: HTMLButtonElement, url: string): void {
  if (url) {
    link.dataset.url = url;
    link.disabled = false;
    return;
  }
  delete link.dataset.url;
  link.disabled = true;
}

function buildLayout(items: readonly CollectedMap[]): { offsets: number[]; total: number } {
  const nextOffsets: number[] = [];
  let y = 0;
  for (const map of items) {
    nextOffsets.push(y);
    y += (map.mine ? COMPARE_HEIGHT : COMPACT_HEIGHT) + ROW_GAP;
  }
  return { offsets: nextOffsets, total: y };
}

function rowAt(offsets: readonly number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if ((offsets[mid] ?? 0) <= position) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

function scoreLabel(acc: number, mod: string): string {
  return mod ? `${acc}% ${mod}` : `${acc}%`;
}

function accuracyColor(acc: number): string {
  if (acc < 70) return "#242424";
  if (acc < 80) return "MediumSeaGreen";
  if (acc < 85) return "#59b0f4";
  if (acc < 90) return "tomato";
  if (acc < 95) return "#bf2a42";
  return "#8f48db";
}
