import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { db, loadGroups, loadPlacements, type ClassRow, type StudentRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { fmtDate, fmtRange, STATUS_LABEL } from "@/lib/format";
import ConfirmButton from "@/components/ConfirmButton";
import { addGroups, deleteGroup, deleteStudent, moveStudent, setStatus, unplaceStudent, updateClass } from "../actions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  const { msg, error } = await searchParams;
  if (!UUID.test(id)) notFound();

  const { data: cls } = await db().from("classes").select("*").eq("id", id).maybeSingle<ClassRow>();
  if (!cls) notFound();
  const [groups, studentsRes] = await Promise.all([
    loadGroups(id),
    db().from("students").select("*").eq("class_id", id).order("last_name").order("first_name"),
  ]);
  const students = (studentsRes.data ?? []) as StudentRow[];
  const placements = await loadPlacements(students.map((s) => s.id));
  const placeOf = new Map(placements.map((p) => [p.student_id, p]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const inGroup = (gid: string) => students.filter((s) => placeOf.get(s.id)?.group_id === gid);

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const placed = placements.length;
  const waitlist = students.filter((s) => s.ranked_at && !placeOf.has(s.id));
  const notRanked = students.filter((s) => !s.ranked_at && !placeOf.has(s.id));
  const firstChoice = placements.filter((p) => p.rank_got === 1).length;
  const seats = groups.length * cls.seats_per_group;

  const next: { to: "signup" | "ranking" | "closed"; label: string }[] =
    cls.status === "signup"
      ? [{ to: "ranking", label: "Post schedule and open group choices" }]
      : cls.status === "ranking"
        ? [{ to: "closed", label: "Close the class" }, { to: "signup", label: "Back to sign-up only" }]
        : [{ to: "ranking", label: "Reopen group choices" }];

  return (
    <div>
      <p className="small"><Link href="/admin">← All classes</Link></p>
      <h1>{cls.name}</h1>
      <p className="lede">
        <span className="pill ok">{STATUS_LABEL[cls.status]}</span>{" "}
        Sign-up page: <code>{base}/</code>
      </p>
      {msg && <p className="notice good" role="status">{msg}</p>}
      {error && <p className="notice bad" role="alert">{error}</p>}

      <div className="stats">
        <div className="stat"><b>{students.length}</b><span>signed up</span></div>
        <div className="stat"><b>{placed}/{seats}</b><span>seats filled</span></div>
        <div className="stat"><b>{placed ? Math.round((firstChoice / placed) * 100) + "%" : "–"}</b><span>got their first choice</span></div>
        <div className="stat"><b>{waitlist.length}</b><span>on the waitlist</span></div>
        <div className="stat"><b>{notRanked.length}</b><span>haven&apos;t ranked yet</span></div>
      </div>

      <div className="bar">
        {next.map((n) => (
          <form key={n.to} action={setStatus.bind(null, id, n.to)}>
            <button type="submit" className={n.to === "ranking" ? "go" : ""}>{n.label}</button>
          </form>
        ))}
        <a className="btn" href={`/admin/${id}/export`}>Download CSV</a>
      </div>
      {cls.status === "signup" && students.length > 0 && (
        <p className="small">When you open group choices, send each family their private link (it&apos;s in the CSV) so they can rank groups.</p>
      )}

      {waitlist.length > 0 && (
        <div className="box">
          <h2 style={{ marginTop: 0 }}>Waitlist</h2>
          <p className="small">These students ranked only groups that filled. They&apos;re placed automatically when a spot opens, or move them by hand below.</p>
          <p>{waitlist.map((s) => `${s.first_name} ${s.last_name}`).join(", ")}</p>
        </div>
      )}

      <h2>Groups ({groups.length})</h2>
      {groups.length === 0 && <p className="small">No groups yet. Paste them below.</p>}
      <div className="groups">
        {groups.map((g) => {
          const members = inGroup(g.id);
          const full = members.length >= cls.seats_per_group;
          return (
            <article key={g.id} className="group">
              <header>
                <h3>{g.name}</h3>
                <span className="seats" style={full ? { color: "var(--stop)" } : undefined}>{members.length}/{cls.seats_per_group} filled</span>
              </header>
              <ul className="drv">
                {g.drives.map((d, i) => (
                  <li key={i}><b>{fmtDate(d.drive_date)}</b><span className="nowrap">{fmtRange(d.start_time, d.end_time)}</span></li>
                ))}
              </ul>
              <p className="small" style={{ margin: 0 }}>
                {members.length ? members.map((s) => `${s.first_name} ${s.last_name}${placeOf.get(s.id)?.method === "manual" ? " (moved)" : ""}`).join(" & ") : "Nobody yet"}
              </p>
              {members.length === 0 && (
                <form action={deleteGroup.bind(null, id, g.id)}>
                  <ConfirmButton question={`Delete ${g.name} and its drive times?`}>Delete group</ConfirmButton>
                </form>
              )}
            </article>
          );
        })}
      </div>

      <form action={addGroups.bind(null, id)} className="box" style={{ marginTop: 16 }}>
        <h3>Add groups and drive times</h3>
        <p className="small">
          One drive per line: group name, date, start time, end time. Copy straight from a spreadsheet (tabs work) or type with commas. Lines for an existing group add to it.
        </p>
        <textarea name="rows" placeholder={"Group 1, 12/5/2026, 9:00 AM, 11:00 AM\nGroup 1, 12/9/2026, 4:15 PM, 6:15 PM\nGroup 2, 12/6/2026, 1:00 PM, 3:00 PM"} />
        <div className="bar"><button className="go" type="submit">Add drive times</button></div>
      </form>

      <h2>Students ({students.length})</h2>
      <div className="scroll">
        <table className="stack">
          <thead>
            <tr><th>Student</th><th>Parent contact</th><th>Partner</th><th>Status</th><th>Move to</th><th></th></tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const p = placeOf.get(s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.first_name} {s.last_name}</b>{" "}
                    <span className="small">{s.gender === "F" ? "F" : "M"}</span>
                    <br /><a className="small" href={`${base}/s/${s.token}`}>Private link</a>
                  </td>
                  <td className="small">{s.parent_name ? <>{s.parent_name}<br /></> : null}{s.parent_email}{s.phone ? <><br />{s.phone}</> : null}</td>
                  <td className="small">{s.partner_pref === "any" ? "Any" : s.partner_pref === "F" ? "Female" : "Male"}</td>
                  <td>
                    {p ? (
                      <span className="pill ok">{groupName.get(p.group_id)}{p.rank_got ? ` · choice #${p.rank_got}` : ""}</span>
                    ) : s.ranked_at ? (
                      <span className="pill warn">Waitlist</span>
                    ) : (
                      <span className="pill">{cls.status === "signup" ? "Waiting for schedule" : "Hasn't ranked"}</span>
                    )}
                  </td>
                  <td>
                    {groups.length > 0 && (
                      <form action={moveStudent.bind(null, id, s.id)} className="inline">
                        <select name="group_id" defaultValue="" aria-label={`Move ${s.first_name} to group`}>
                          <option value="" disabled>Group…</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name} ({inGroup(g.id).length}/{cls.seats_per_group})</option>
                          ))}
                        </select>
                        <label className="small" style={{ fontWeight: 400 }}><input type="checkbox" name="force" style={{ minHeight: 0, width: "auto", display: "inline" }} /> allow over</label>
                        <button className="x" type="submit">Move</button>
                      </form>
                    )}
                  </td>
                  <td>
                    <div className="inline">
                      {p && (
                        <form action={unplaceStudent.bind(null, id, s.id)}>
                          <ConfirmButton question={`Take ${s.first_name} out of ${groupName.get(p.group_id)}? The spot goes to the waitlist.`}>Unplace</ConfirmButton>
                        </form>
                      )}
                      <form action={deleteStudent.bind(null, id, s.id)}>
                        <ConfirmButton question={`Delete ${s.first_name} ${s.last_name} completely? This can't be undone.`}>Delete</ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Settings</h2>
      <form action={updateClass.bind(null, id)} className="box">
        <div className="row">
          <label>Class name<input name="name" defaultValue={cls.name} /></label>
          <label>Students per group<input name="seats" type="number" min={1} max={10} defaultValue={cls.seats_per_group} /></label>
          <label>Groups each student must rank<input name="min_ranks" type="number" min={1} max={20} defaultValue={cls.min_ranks} /></label>
        </div>
        <button type="submit">Save settings</button>
      </form>
    </div>
  );
}
