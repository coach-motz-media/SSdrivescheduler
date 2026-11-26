"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SubmitResult = { status: "placed" | "waitlist" | "error"; message?: string; rank?: number };

export async function submitRanks(token: string, groupIds: string[]): Promise<SubmitResult> {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return { status: "error", message: "This link is not valid." };
  if (!Array.isArray(groupIds) || groupIds.length > 200 || !groupIds.every((g) => typeof g === "string" && UUID.test(g))) {
    return { status: "error", message: "Please choose your groups again." };
  }
  const { data, error } = await db().rpc("submit_rankings", { p_token: token, p_groups: groupIds });
  if (error) return { status: "error", message: "Something went wrong. Please try again." };
  revalidatePath(`/s/${token}`);
  return data as SubmitResult;
}
