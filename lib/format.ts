/** "2026-12-05" -> "Sat, Dec 5" (no time-zone shifting) */
export function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "16:15:00" -> "4:15 PM" */
export function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function fmtRange(start: string, end: string): string {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

export const PREF_LABEL: Record<string, string> = {
  any: "No preference",
  F: "Prefers a female partner",
  M: "Prefers a male partner",
};

export const STATUS_LABEL: Record<string, string> = {
  signup: "Sign-up open",
  ranking: "Group choices open",
  closed: "Closed",
};

/** Parse "2026-12-05", "12/5/2026" or "12/5/26" into "YYYY-MM-DD". */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse "4:15 PM", "4:15pm", "16:15" or "9" into "HH:MM:00". */
export function parseTime(s: string): string | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

/** Parse pasted spreadsheet rows: Group name, date, start time, end time (comma or tab separated). */
export function parseDriveRows(text: string): {
  rows: { group: string; drive_date: string; start_time: string; end_time: string }[];
  errors: string[];
} {
  const rows: { group: string; drive_date: string; start_time: string; end_time: string }[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(line.includes("\t") ? "\t" : ",").map((p) => p.trim());
    if (i === 0 && /group/i.test(parts[0]) && !parseDate(parts[1] ?? "")) return; // header row
    const [group, date, start, end] = parts;
    const d = parseDate(date ?? "");
    const st = parseTime(start ?? "");
    const en = parseTime(end ?? "");
    if (!group || !d || !st || !en) {
      errors.push(`Line ${i + 1}: "${line.trim().slice(0, 60)}"`);
      return;
    }
    if (en <= st) {
      errors.push(`Line ${i + 1}: end time is not after start time`);
      return;
    }
    rows.push({ group: group.slice(0, 80), drive_date: d, start_time: st, end_time: en });
  });
  return { rows, errors };
}
