import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Server-only Supabase client using the service role key. Never import this from a client component. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type ClassStatus = "signup" | "ranking" | "closed";

export type ClassRow = {
  id: string;
  name: string;
  status: ClassStatus;
  seats_per_group: number;
  min_ranks: number;
  created_at: string;
};

export type Drive = { drive_date: string; start_time: string; end_time: string };

export type GroupRow = { id: string; name: string; sort: number; drives: Drive[] };

export type StudentRow = {
  id: string;
  class_id: string;
  token: string;
  first_name: string;
  last_name: string;
  student_email: string | null;
  parent_name: string | null;
  parent_email: string;
  phone: string | null;
  gender: "F" | "M";
  partner_pref: "any" | "F" | "M";
  ranked_at: string | null;
  created_at: string;
};

export type Placement = { student_id: string; group_id: string; rank_got: number | null; method: "auto" | "manual" };

/** Groups for a class with their drives sorted by date and time. */
export async function loadGroups(classId: string): Promise<GroupRow[]> {
  const { data, error } = await db()
    .from("groups")
    .select("id, name, sort, drives(drive_date, start_time, end_time)")
    .eq("class_id", classId)
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((g) => ({
    ...(g as GroupRow),
    drives: [...((g as GroupRow).drives ?? [])].sort((a, b) =>
      (a.drive_date + a.start_time).localeCompare(b.drive_date + b.start_time)
    ),
  }));
}

/** All placements for the given students. */
export async function loadPlacements(studentIds: string[]): Promise<Placement[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await db()
    .from("placements")
    .select("student_id, group_id, rank_got, method")
    .in("student_id", studentIds);
  if (error) throw error;
  return (data ?? []) as Placement[];
}
