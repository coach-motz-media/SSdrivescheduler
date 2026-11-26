import { db, type ClassRow } from "@/lib/db";
import { signUp } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { data } = await db()
    .from("classes")
    .select("id, name, status")
    .in("status", ["signup", "ranking"])
    .order("created_at");
  const classes = (data ?? []) as Pick<ClassRow, "id" | "name" | "status">[];

  return (
    <div className="narrow">
      <h1>Sign up for drivers ed</h1>
      <p className="lede">
        Fill this out once. You&apos;ll get a private link to come back to. When the driving schedule is posted,
        you&apos;ll use that link to rank the groups that work for you, and you&apos;ll be placed right away.
      </p>
      {error && <p className="notice bad" role="alert">{error}</p>}
      {classes.length === 0 ? (
        <p className="box">No classes are open for sign-up right now. Check back soon.</p>
      ) : (
        <form action={signUp}>
          <label>
            Class
            <select name="class_id" required defaultValue={classes.length === 1 ? classes[0].id : ""}>
              {classes.length > 1 && <option value="">Choose a class</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <h2>Student</h2>
          <div className="row">
            <label>First name<input name="first_name" autoComplete="given-name" required /></label>
            <label>Last name<input name="last_name" autoComplete="family-name" required /></label>
          </div>
          <div className="row">
            <label>Student email (optional)<input name="student_email" type="email" /></label>
            <label>
              Gender
              <select name="gender" required defaultValue="">
                <option value="" disabled>Choose</option>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </label>
            <label>
              Driving partner preference
              <select name="partner_pref" defaultValue="any">
                <option value="any">No preference</option>
                <option value="F">Prefer a female partner</option>
                <option value="M">Prefer a male partner</option>
              </select>
            </label>
          </div>
          <h2>Parent or guardian</h2>
          <div className="row">
            <label>Name<input name="parent_name" autoComplete="name" /></label>
            <label>Email<input name="parent_email" type="email" autoComplete="email" required /></label>
            <label>Phone<input name="phone" type="tel" autoComplete="tel" /></label>
          </div>
          <button className="go" type="submit">Sign up</button>
        </form>
      )}
    </div>
  );
}
