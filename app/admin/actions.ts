"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { passwordOk, requireAdmin, signIn, signOut } from "@/lib/auth";
import { parseDriveRows } from "@/lib/format";

function msg(id: string, text: string): never {
  redirect(`/admin/${id}?msg=${encodeURIComponent(text)}`);
}
function err(id: string, text: string): never {
  redirect(`/admin/${id}?error=${encodeURIComponent(text)}`);
}
const num = (v: FormDataEntryValue | null, lo: number, hi: number, dflt: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export async function login(fd: FormData) {
  if (!passwordOk(String(fd.get("password") ?? ""))) redirect("/admin?error=" + encodeURIComponent("Wrong password."));
  await signIn();
  redirect("/admin");
}

export async function logout() {
  await signOut();
  redirect("/admin");
}

export async function createClass(fd: FormData) {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 100);
  if (!name) redirect("/admin?error=" + encodeURIComponent("Give the class a name."));
  const { data, error } = await db()
    .from("classes")
    .insert({ name, seats_per_group: num(fd.get("seats"), 1, 10, 2), min_ranks: num(fd.get("min_ranks"), 1, 20, 3) })
    .select("id")
    .single();
  if (error || !data) redirect("/admin?error=" + encodeURIComponent("Could not create the class."));
  redirect(`/admin/${data.id}`);
}

export async function updateClass(id: string, fd: FormData) {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 100);
  const { error } = await db()
    .from("classes")
    .update({ ...(name ? { name } : {}), seats_per_group: num(fd.get("seats"), 1, 10, 2), min_ranks: num(fd.get("min_ranks"), 1, 20, 3) })
    .eq("id", id);
  if (error) err(id, "Could not save settings.");
  msg(id, "Settings saved.");
}

export async function setStatus(id: string, status: "signup" | "ranking" | "closed") {
  await requireAdmin();
  if (!["signup", "ranking", "closed"].includes(status)) err(id, "Unknown status.");
  if (status === "ranking") {
    const { count } = await db().from("groups").select("id", { count: "exact", head: true }).eq("class_id", id);
    if (!count) err(id, "Add groups before opening group choices.");
  }
  await db().from("classes").update({ status }).eq("id", id);
  revalidatePath(`/admin/${id}`);
  msg(id, status === "ranking" ? "Group choices are open. Students can now rank groups from their links." : status === "closed" ? "Class closed." : "Sign-up reopened.");
}

export async function addGroups(id: string, fd: FormData) {
  await requireAdmin();
  const { rows, errors } = parseDriveRows(String(fd.get("rows") ?? ""));
  if (errors.length) err(id, `Nothing was added. Fix these lines: ${errors.slice(0, 5).join("; ")}`);
  if (!rows.length) err(id, "Paste at least one line.");

  const { data: existing } = await db().from("groups").select("id, name, sort").eq("class_id", id);
  const byName = new Map((existing ?? []).map((g) => [g.name.toLowerCase(), g.id as string]));
  let sort = Math.max(0, ...(existing ?? []).map((g) => g.sort as number));
  const newNames = [...new Set(rows.map((r) => r.group))].filter((n) => !byName.has(n.toLowerCase()));
  if (newNames.length) {
    const { data: made, error } = await db()
      .from("groups")
      .insert(newNames.map((name) => ({ class_id: id, name, sort: parseInt(name.replace(/\D+/g, ""), 10) || ++sort })))
      .select("id, name");
    if (error) err(id, "Could not create groups.");
    (made ?? []).forEach((g) => byName.set(g.name.toLowerCase(), g.id));
  }
  const { error } = await db()
    .from("drives")
    .insert(rows.map((r) => ({ group_id: byName.get(r.group.toLowerCase()), drive_date: r.drive_date, start_time: r.start_time, end_time: r.end_time })));
  if (error) err(id, "Could not save drive times.");
  msg(id, `Added ${rows.length} drive time${rows.length === 1 ? "" : "s"} across ${new Set(rows.map((r) => r.group)).size} group(s).`);
}

export async function deleteGroup(id: string, groupId: string) {
  await requireAdmin();
  const { count } = await db().from("placements").select("student_id", { count: "exact", head: true }).eq("group_id", groupId);
  if (count) err(id, "Move the students out of that group before deleting it.");
  await db().from("groups").delete().eq("id", groupId).eq("class_id", id);
  msg(id, "Group deleted.");
}

export async function moveStudent(id: string, studentId: string, fd: FormData) {
  await requireAdmin();
  const groupId = String(fd.get("group_id") ?? "");
  if (!groupId) err(id, "Choose a group.");
  const { data, error } = await db().rpc("move_student", { p_student: studentId, p_group: groupId, p_force: fd.get("force") === "on" });
  if (error) err(id, "Could not move the student.");
  const res = data as { status: string; message?: string };
  if (res.status !== "ok") err(id, res.message ?? "Could not move the student.");
  msg(id, "Student moved.");
}

export async function unplaceStudent(id: string, studentId: string) {
  await requireAdmin();
  await db().from("placements").delete().eq("student_id", studentId);
  const { data: filled } = await db().rpc("fill_waitlist", { p_class: id });
  msg(id, `Student removed from their group.${filled ? ` ${filled} waitlisted student(s) placed automatically.` : ""}`);
}

export async function deleteStudent(id: string, studentId: string) {
  await requireAdmin();
  await db().from("students").delete().eq("id", studentId).eq("class_id", id);
  const { data: filled } = await db().rpc("fill_waitlist", { p_class: id });
  msg(id, `Student deleted.${filled ? ` ${filled} waitlisted student(s) placed automatically.` : ""}`);
}
