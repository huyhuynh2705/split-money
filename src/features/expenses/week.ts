const DAY_LABELS = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateVN(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

// ISO weekday: Monday=1 ... Sunday=7
function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

// Returns ISO year + ISO week number for the given date
export function getISOWeek(d: Date): { year: number; week: number } {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Thursday in current week decides the year
  target.setDate(target.getDate() + 4 - isoWeekday(target));
  const year = target.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { year, week };
}

// Monday of the ISO week containing `d`
export function getWeekStart(d: Date): Date {
  const wd = isoWeekday(d);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - (wd - 1));
  return monday;
}

export function getWeekKey(iso: string): string {
  const d = parseDate(iso);
  const { week } = getISOWeek(d);
  const start = getWeekStart(d);
  const dd = String(start.getDate()).padStart(2, "0");
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const yyyy = start.getFullYear();
  return `Tuần ${week} (${dd}/${mm}/${yyyy})`;
}

export function getDayLabel(iso: string): string {
  const d = parseDate(iso);
  return DAY_LABELS[isoWeekday(d) - 1];
}

export function dayLabelOrder(label: string): number {
  return DAY_LABELS.indexOf(label);
}

// Sort week keys chronologically by parsing the date in parentheses
export function compareWeekKeys(a: string, b: string): number {
  const re = /\((\d{2})\/(\d{2})\/(\d{4})\)/;
  const ma = re.exec(a);
  const mb = re.exec(b);
  if (!ma || !mb) return a.localeCompare(b);
  const da = new Date(+ma[3], +ma[2] - 1, +ma[1]).getTime();
  const db = new Date(+mb[3], +mb[2] - 1, +mb[1]).getTime();
  return da - db;
}
