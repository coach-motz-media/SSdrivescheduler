import Link from "next/link";
import { db, type ClassRow } from "@/lib/db";
import { configured, isAdmin } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/format";
import { createClass, login, logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  if (!(await isAdmin())) {
    return (
      <div className="narrow">
        <h1>Office sign-in</h1>
        {!configured() && <p className="notice bad">ADMIN_PASSWORD and SESSION_SECRET are not set on the server yet.</p>}
        {error && <p className="notice bad" role="alert">{error}</p>}
        <form action={login} className="row">
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <div style={{ alignSelf: "end" }}><button className="go" type="submit">Sign in</button></div>
        </form>
      </div>
    );
  }

  const { data } = await db().from("classes").select("*").order("created_at", { ascending: false });
  const classes = (data ?? []) as ClassRow[];
  const counts = await Promise.all(
    classes.map(async (c) => {
      const { count } = await db().from("students").select("id", { count: "exact", head: true }).eq("class_id", c.id);
      return count ?? 0;
    })
  );

  return (
    <div>
      <div className="bar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Classes</h1>
        <form action={logout}><button type="submit">Sign out</button></form>
      </div>
      {error && <p className="notice bad" role="alert">{error}</p>}
      {classes.length === 0 ? (
        <p className="box">No classes yet. Create your first one below.</p>
      ) : (
        <div className="scroll">
          <table className="stack">
            <thead><tr><th>Class</th><th>Status</th><th>Sign-ups</th></tr></thead>
            <tbody>
              {classes.map((c, i) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/${c.id}`}><b>{c.name}</b></Link></td>
                  <td>{STATUS_LABEL[c.status]}</td>
                  <td>{counts[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>New class</h2>
      <form action={createClass} className="box">
        <div className="row">
          <label>Class name<input name="name" placeholder="Spring 2027 – Session A" required /></label>
          <label>Students per group<input name="seats" type="number" min={1} max={10} defaultValue={2} /></label>
          <label>Groups each student must rank<input name="min_ranks" type="number" min={1} max={20} defaultValue={3} /></label>
        </div>
        <button className="go" type="submit">Create class</button>
      </form>
    </div>
  );
}
