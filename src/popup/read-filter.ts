import { type RangeBound, type ScoreFilter, type SelfCompare } from "../shared/score-filter";

export type ReadFilterResult = { ok: true; filter: ScoreFilter } | { ok: false; error: string };

export function readScoreFilter(root: ParentNode = document): ReadFilterResult {
  const star = readRange(root, "enableFilterByStar", "filterByStarLow", "filterByStarMax", "星");
  const pp = readRange(root, "enableFilterByPP", "filterByPPLow", "filterByPPMax", "PP");
  const accuracy = readRange(root, "enableFilterByACC", "filterByACCLow", "filterByACCMax", "精度");
  const misses = readRange(root, "enableFilterByMiss", "filterByMissLow", "filterByMissMax", "ミス数");
  const limit = readLimit(root);
  const ranges = [star, pp, accuracy, misses, limit];
  for (const result of ranges) {
    if (!result.ok) {
      return result;
    }
  }
  if (!star.ok || !pp.ok || !accuracy.ok || !misses.ok || !limit.ok) {
    return { ok: false, error: "フィルタを読み取れません" };
  }

  return {
    ok: true,
    filter: {
      star: star.range,
      pp: pp.range,
      accuracy: accuracy.range,
      misses: misses.range,
      limit: limit.limit,
      unrankedOnly: checked(root, "enableUnranked"),
      noFailOnly: checked(root, "onlyNF"),
      selfCompare: readSelfCompare(root),
    },
  };
}

type RangeResult = { ok: true; range?: RangeBound } | { ok: false; error: string };
type LimitResult = { ok: true; limit?: number } | { ok: false; error: string };

function readRange(
  root: ParentNode,
  enabledId: string,
  minId: string,
  maxId: string,
  label: string,
): RangeResult {
  if (!checked(root, enabledId)) {
    return { ok: true };
  }
  const min = readBound(inputValue(root, minId), `${label}の最小`);
  const max = readBound(inputValue(root, maxId), `${label}の最大`);
  if (!min.ok) {
    return min;
  }
  if (!max.ok) {
    return max;
  }
  if (min.value !== undefined && max.value !== undefined && min.value > max.value) {
    return { ok: false, error: `${label}の最小が最大を超えています` };
  }
  return { ok: true, range: { min: min.value, max: max.value } };
}

function readLimit(root: ParentNode): LimitResult {
  if (!checked(root, "enableInfinity")) {
    return { ok: true };
  }
  const raw = inputValue(root, "filterByRange").trim();
  if (raw === "") {
    return { ok: false, error: "個数を入力してください" };
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return { ok: false, error: "個数には1以上の整数を入力してください" };
  }
  return { ok: true, limit: value };
}

function readBound(raw: string, label: string): { ok: true; value?: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label}には数値を入力してください` };
  }
  return { ok: true, value };
}

const SELF_COMPARES: readonly SelfCompare[] = ["unplayed", "played", "win", "lose", "tie"];

function readSelfCompare(root: ParentNode): SelfCompare | undefined {
  const select = root.querySelector<HTMLSelectElement>("#selfCompare");
  if (!select || select.disabled) {
    return undefined;
  }
  return SELF_COMPARES.find((value) => value === select.value);
}

function checked(root: ParentNode, id: string): boolean {
  const input = root.querySelector<HTMLInputElement>(`#${id}`);
  return input?.checked === true;
}

function inputValue(root: ParentNode, id: string): string {
  return root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
}
