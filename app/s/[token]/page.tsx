import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db, loadGroups, type ClassRow, type StudentRow } from "@/lib/db";
import { fmtDate, fmtRange } from "@/lib/format";
import RankForm, { type RankGroup } from "./RankForm";

export const dynamic = "force-dynamic";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();

  const { data: student } = await db().from("students").select("*").eq("token", token).maybeSingle<StudentRow>();
  if (!student) notFound();
  const { data: cls } = await db().from("classes").select("*").eq("id", student.class_id).single<ClassRow>();
  if (!cls) notFound();

  const h = await headers();
  const link = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/s/${token}`;

  const { data: placement } = await db()
    .from("placements")
    .select("group_id, rank_got")
    .eq("student_id", student.id)
    .maybeSingle<{ group_id: string; rank_got: number | null }>();

  const groups = await loadGroups(cls.id);

  const saveLink = (
    <div className="box">
      <h3>Save your private link</h3>
      <p className="small">Bookmark this page or copy the link below. You&apos;ll need it to choose your group and see your drive times.</p>
      <code>{link}</code>
    </div>
  );

  if (placement) {
    const group = groups.find((g) => g.id === placement.group_id);
    const { data: mates } = await db()
      .from("placements")
      .select("students(first_name, last_name)")
      .eq("group_id", placement.group_id)
      .neq("student_id", student.id);
    const partners = (mates ?? [])
      .map((m) => (Array.isArray(m.students) ? m.students[0] : m.students) as { first_name: string; last_name: string } | null)
      .filter(Boolean)
      .map((p) => `${p!.first_name} ${p!.last_name.charAt(0)}.`);
    return (
      <div className="narrow">
        <h1>You&apos;re in, {student.first_name}!</h1>
        <div className="result">
          <h2>{group?.name ?? "Your group"}</h2>
          <p>
            {placement.rank_got ? `This was your choice #${placement.rank_got}. ` : ""}
            {partners.length ? `Driving partner: ${partners.join(", ")}.` : "Your driving partner hasn't been placed yet. Check back here later."}
          </p>
          <ul className="drv">
            {group?.drives.map((d, i) => (
              <li key={i}><b>{fmtDate(d.drive_date)}</b><span className="nowrap">{fmtRange(d.start_time, d.end_time)}</span></li>
            ))}
          </ul>
        </div>
        <p className="small">Can&apos;t make one of these drives? Contact the drivers ed office. Your spot can only be changed by them.</p>
        {saveLink}
      </div>
    );
  }

  if (cls.status === "signup") {
    return (
      <div className="narrow">
        <h1>{isNew ? "You're signed up!" : `Hi ${student.first_name}`}</h1>
        <p className="lede">
          {cls.name}: the driving schedule hasn&apos;t been posted yet. Once it is, come back to this page to rank the
          groups that fit your schedule. You&apos;ll be placed the moment you submit, so earlier is better.
        </p>
        {saveLink}
      </div>
    );
  }

  if (cls.status === "closed") {
    return (
      <div className="narrow">
        <h1>Group choices are closed</h1>
        <p className="lede">You weren&apos;t placed in a group for {cls.name}. Please contact the drivers ed office.</p>
      </div>
    );
  }

  const { data: avail } = await db().rpc("groups_for_student", { p_token: token });
  const availMap = new Map(
    ((avail ?? []) as { group_id: string; seats_left: number; available: boolean }[]).map((a) => [a.group_id, a])
  );
  const rankGroups: RankGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    seatsLeft: Math.max(0, availMap.get(g.id)?.seats_left ?? 0),
    available: availMap.get(g.id)?.available ?? false,
    drives: g.drives.map((d) => ({ date: fmtDate(d.drive_date), time: fmtRange(d.start_time, d.end_time) })),
  }));

  return (
    <div>
      <h1>Choose your driving group</h1>
      <p className="lede">
        Each group has set drive dates and room for {cls.seats_per_group} students. Add the groups you can make in
        order of preference, at least {cls.min_ranks}. You&apos;ll be placed in the highest one on your list that still
        has a spot, as soon as you submit.
      </p>
      {student.ranked_at && (
        <p className="notice bad">
          Every group on your last list filled up before you could be placed, so you&apos;re on the waitlist. Pick from
          the open groups below to get placed now.
        </p>
      )}
      <RankForm token={token} groups={rankGroups} minRanks={cls.min_ranks} />
    </div>
  );
}
