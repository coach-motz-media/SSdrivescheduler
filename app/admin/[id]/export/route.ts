import { db, loadGroups, loadPlacements, type ClassRow, type StudentRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { fmtDate, fmtRange } from "@/lib/format";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  const { data: cls } = await db().from("classes").select("*").eq("id", id).maybeSingle<ClassRow>();
  if (!cls) return new Response("Not found", { status: 404 });

  const groups = await loadGroups(id);
  const { data } = await db().from("students").select("*").eq("class_id", id).order("last_name");
  const students = (data ?? []) as StudentRow[];
  const placements = new Map((await loadPlacements(students.map((s) => s.id))).map((p) => [p.student_id, p]));
  const origin = new URL(req.url).origin;
  const maxDrives = Math.max(0, ...groups.map((g) => g.drives.length));

  const rows: unknown[][] = [[
    "Last name", "First name", "Gender", "Partner preference", "Parent name", "Parent email", "Student email", "Phone",
    "Status", "Group", "Choice #", ...Array.from({ length: maxDrives }, (_, i) => `Drive ${i + 1}`), "Private link",
  ]];
  for (const s of students) {
    const p = placements.get(s.id);
    const g = p ? groups.find((x) => x.id === p.group_id) : undefined;
    const status = p ? "Placed" : s.ranked_at ? "Waitlist" : "Not ranked";
    rows.push([
      s.last_name, s.first_name, s.gender, s.partner_pref, s.parent_name, s.parent_email, s.student_email, s.phone,
      status, g?.name ?? "", p?.rank_got ?? "",
      ...Array.from({ length: maxDrives }, (_, i) => (g?.drives[i] ? `${fmtDate(g.drives[i].drive_date)} ${fmtRange(g.drives[i].start_time, g.drives[i].end_time)}` : "")),
      `${origin}/s/${s.token}`,
    ]);
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const file = cls.name.replace(/[^\w-]+/g, "-").toLowerCase() || "class";
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` },
  });
}
