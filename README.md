# Drivers Ed Scheduler

Students sign up, rank the pre-built driving groups, and are placed **instantly** in the highest-ranked group that still has a seat and a compatible partner. The office manages classes, groups, and placements at `/admin`.

**Stack:** Next.js 15 (App Router) on Vercel · Supabase Postgres

## How it works

1. **Sign-up** (`/`): student + parent info, gender, and partner preference (no preference / prefer female / prefer male). Each student gets a private link (`/s/…`). No passwords.
2. **Office builds groups** (`/admin` → class): paste rows from a spreadsheet: `Group name, date, start, end`. One line per drive.
3. **Office opens group choices**: students use their private link to rank groups. They only see groups with a seat they can actually take, so they rarely get stuck.
4. **Instant placement**: on submit, the database places them in their highest-ranked open, compatible group. A database lock means two students can never take the last seat at the same time.
5. **Waitlist**: if every group they ranked filled first, they go on the waitlist and are placed automatically when a spot opens.
6. **Office tools**: move or unplace students, delete groups, and download a CSV with every student's group, drive dates, and private link (for mail merge).

Partner preference works both ways: a student who prefers a female partner is only placed with a female student, and nobody is placed with someone whose preference excludes them.

## Setup (about 15 minutes)

### 1. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste all of `supabase/migrations/0001_schema.sql`, then click **Run**.
3. *(Optional, for demos)* Run `supabase/seed_demo.sql`. It creates a "Demo Class" with 30 groups and 40 made-up students already placed, leaving open spots.
4. Go to **Project Settings → API** and copy the **Project URL** and the **service_role** key (keep this one secret).

### 2. GitHub
Create a new private repo and upload this folder's contents (not the zip itself). Drag-and-drop on github.com works.

### 3. Vercel
1. **Add New → Project**, then import the repo. Vercel detects Next.js.
2. Add these **Environment Variables**:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `ADMIN_PASSWORD` | password the office types at `/admin` |
| `SESSION_SECRET` | any long random string (e.g. 40 random characters) |
| `NEXT_PUBLIC_SCHOOL_NAME` | optional header name, e.g. `Drivers Ed` |

3. Click **Deploy**. You'll get a URL like `drivers-ed-scheduler.vercel.app`.

### 4. Install on a phone
Open the URL in Chrome on Android → ⋮ menu → **Add to Home screen** / **Install app**. On iPhone: Safari → Share → **Add to Home Screen**.

## Running a class

1. `/admin` → sign in → **New class** (set students per group and how many groups each student must rank).
2. Share the sign-up page (`/`) with families.
3. When enough have signed up, paste the groups and drive times, then click **Post schedule and open group choices**.
4. Send families their private links (in the CSV, column "Private link"). Students rank and are placed immediately.
5. Watch the dashboard: seats filled, first-choice rate, waitlist. Close the class when done.

## Demo script (for showing someone)

1. Run `seed_demo.sql`, open the site on your phone, and sign up as a made-up student in **Demo Class**.
2. You land on the ranking page right away (the demo is already open for choices). Add 3 groups and submit.
3. You're placed, with your group's drive dates and partner shown.
4. On a laptop, open `/admin` → Demo Class to show the office view: who's where, who got their first choice, the waitlist, and the CSV.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000
```

## Files

- `supabase/migrations/0001_schema.sql`: tables, row-level security (locked to the server), and the placement functions (`submit_rankings`, `place_student`, `fill_waitlist`, `move_student`, `groups_for_student`)
- `app/page.tsx` + `app/actions.ts`: public sign-up
- `app/s/[token]/`: student page: waiting, ranking, placed
- `app/admin/`: office login, classes, class dashboard, CSV export
- `lib/`: database client, admin auth cookie, date/time parsing

## Ideas for next

- Automatic emails (e.g. Resend) when the schedule posts and when a student is placed
- Let students request a specific partner
- A "swap request" flow for students who can't make a drive
