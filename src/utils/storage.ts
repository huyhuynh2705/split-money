import type { AppData, Expense } from "../types";
import { formatDateISO } from "./week";

const DAY_OFFSET: Record<string, number> = {
  "Thứ 2": 0,
  "Thứ 3": 1,
  "Thứ 4": 2,
  "Thứ 5": 3,
  "Thứ 6": 4,
  "Thứ 7": 5,
  "Chủ nhật": 6,
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Convert old python-style format: { "Tuần X (DD/MM/YYYY)": { "Thứ N": [{...}] } }
function convertLegacy(raw: unknown): AppData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const weekRe = /^Tuần\s+\d+\s+\((\d{2})\/(\d{2})\/(\d{4})\)$/;
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  const allWeekShape = keys.every((k) => weekRe.test(k));
  if (!allWeekShape) return null;

  const expenses: Expense[] = [];
  const memberSet = new Set<string>();

  for (const weekKey of keys) {
    const m = weekRe.exec(weekKey)!;
    const monday = new Date(+m[3], +m[2] - 1, +m[1]);
    const days = obj[weekKey] as Record<string, unknown>;
    if (typeof days !== "object" || days === null) continue;
    for (const dayLabel of Object.keys(days)) {
      const offset = DAY_OFFSET[dayLabel];
      if (offset === undefined) continue;
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      const iso = formatDateISO(date);
      const list = days[dayLabel];
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        if (typeof it !== "object" || it === null) continue;
        const r = it as Record<string, unknown>;
        const payer = String(r.payer ?? "");
        const amount = Number(r.amount ?? 0);
        const sharedWith = Array.isArray(r.shared_with)
          ? (r.shared_with as unknown[]).map((x) => String(x))
          : [];
        const note = String(r.note ?? "");
        if (!payer || !amount) continue;
        memberSet.add(payer);
        sharedWith.forEach((p) => memberSet.add(p));
        expenses.push({
          id: uid(),
          date: iso,
          payer,
          amount,
          sharedWith,
          note,
        });
      }
    }
  }

  return {
    members: Array.from(memberSet),
    expenses,
    doneWeeks: [],
  };
}

export function parseAppData(text: string): AppData {
  const raw = JSON.parse(text);
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as AppData).members) &&
    Array.isArray((raw as AppData).expenses)
  ) {
    const r = raw as AppData;
    return {
      members: r.members.map((s) => String(s)),
      expenses: r.expenses.map((e) => ({
        id: e.id || uid(),
        date: String(e.date),
        payer: String(e.payer),
        amount: Number(e.amount),
        sharedWith: Array.isArray(e.sharedWith)
          ? e.sharedWith.map((s) => String(s))
          : [],
        note: String(e.note ?? ""),
      })),
      doneWeeks: Array.isArray(r.doneWeeks)
        ? r.doneWeeks.map((s) => String(s))
        : [],
    };
  }
  const legacy = convertLegacy(raw);
  if (legacy) return legacy;
  throw new Error("Định dạng file JSON không hợp lệ.");
}

export function downloadAppData(data: AppData, filename = "split-money.json") {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function newId() {
  return uid();
}

const CACHE_KEY = "split-money:data";

export function loadCachedAppData(): AppData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return parseAppData(raw);
  } catch {
    return null;
  }
}

export function saveAppDataToCache(data: AppData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota / disabled storage
  }
}

export function clearAppDataCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
