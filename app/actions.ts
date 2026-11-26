"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(fd: FormData, name: string, max = 120): string {
  return String(fd.get(name) ?? "").trim().slice(0, max);
}

export async function signUp(fd: FormData) {
  const classId = field(fd, "class_id", 40);
  const first = field(fd, "first_name", 60);
  const last = field(fd, "last_name", 60);
  const parentEmail = field(fd, "parent_email").toLowerCase();
  const studentEmail = field(fd, "student_email").toLowerCase();
  const gender = field(fd, "gender", 1);
  const pref = field(fd, "partner_pref", 3) || "any";

  let error = "";
  if (!classId) error = "Choose a class.";
  else if (!first || !last) error = "Enter the student's first and last name.";
  else if (!EMAIL.test(parentEmail)) error = "Enter a valid parent email.";
  else if (studentEmail && !EMAIL.test(studentEmail)) error = "The student email doesn't look right.";
  else if (!["F", "M"].includes(gender)) error = "Choose a gender so partner preferences can be matched.";
  else if (!["any", "F", "M"].includes(pref)) error = "Choose a partner preference.";
  if (error) redirect(`/?error=${encodeURIComponent(error)}`);

  const { data: cls } = await db().from("classes").select("id, status").eq("id", classId).maybeSingle();
  if (!cls || cls.status === "closed") redirect(`/?error=${encodeURIComponent("That class is no longer taking sign-ups.")}`);

  const { data, error: insertError } = await db()
    .from("students")
    .insert({
      class_id: classId,
      first_name: first,
      last_name: last,
      student_email: studentEmail || null,
      parent_name: field(fd, "parent_name") || null,
      parent_email: parentEmail,
      phone: field(fd, "phone", 30) || null,
      gender,
      partner_pref: pref,
    })
    .select("token")
    .single();
  if (insertError || !data) redirect(`/?error=${encodeURIComponent("Something went wrong. Please try again.")}`);

  redirect(`/s/${data.token}?new=1`);
}
