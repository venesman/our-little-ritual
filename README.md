# Our Little Ritual

*A little something, every week.*

A private, invite-only app for two people in a long-distance relationship.
React + TypeScript + Tailwind, Supabase (Auth, Postgres, Storage), deployed on Vercel.

**Status: Phase 1 — Foundation** (accounts, a shared space, a one-time partner invitation, two-member limit).
Weekly activities arrive in Phase 2.

---

## 1. Set up Supabase (one time, ~10 minutes)

1. Go to [supabase.com](https://supabase.com) → **New project**. Region: **Southeast Asia (Singapore)** is a good middle ground
   for Malaysia and Chile. Save the database password somewhere safe (you won't need it in the app).
2. **SQL Editor → New query** → paste the whole of `supabase/migrations/0001_foundation.sql` → **Run**.
   You should see "Success. No rows returned". Run each later migration the same way, in number order, once.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled and **Confirm email ON**.
4. **Authentication → URL Configuration**
   - *Site URL*: your Vercel address, e.g. `https://our-little-ritual.vercel.app`
   - *Redirect URLs*: add `https://our-little-ritual.vercel.app/**` and `http://localhost:5173/**`
5. **Email delivery (strongly recommended)**: Supabase's built-in email sender is heavily rate-limited and meant for testing.
   For reliable confirmation emails, create a free [Resend](https://resend.com) account, then in
   **Authentication → Emails → SMTP Settings** enable custom SMTP with Resend's details
   (host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key, sender = an address on a domain you verified in Resend).
6. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key.
   *Never* copy the `service_role` / secret key into this project — the app doesn't need it.
7. After you **and** your partner have both joined: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**.
   Nobody else can then even create an account. (Optional but recommended.)

## 2. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import `venesman/our-little-ritual`.
2. Framework preset: **Vite** (detected automatically). Build command `npm run build`, output `dist`.
3. **Environment Variables** (all environments):
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL from step 1.6 |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key from step 1.6 |
4. **Deploy**. Then put the final URL into Supabase step 1.4 if it differs.
   Every push to `main` redeploys automatically.

## 3. Run locally (optional)

```bash
npm install
cp .env.example .env.local   # fill in the two values
npm run dev                  # http://localhost:5173
```

---

## How pairing works

1. Partner A signs up and creates the space (status **pending**).
2. A creates an invitation link: `https://…/join#t=<token>`.
   The token is 256 random bits made by Postgres. Only its SHA-256 hash is stored, so the link can't be recovered from the database —
   only replaced. It sits in the URL *fragment*, which browsers never send to servers or logs.
3. Partner B opens the link, creates an account (or signs in), sees *"Vee invited you"*, taps **Join**.
4. The database function `accept_invitation` locks the space, checks the link is valid, unexpired, unused and that the space has one
   member, adds B, marks the link used and sets the space **active**.

Links expire after 7 days, work once, and making a new link disables the previous one.

## Security model

- **Row Level Security on every table.** Members can read only their own space, its two members and its invitation status.
  An outsider's queries return nothing.
- **No direct writes** to `relationships`, `relationship_members` or `invitations` from the browser — table privileges are revoked.
  All changes go through `SECURITY DEFINER` functions that validate membership server-side, use an empty `search_path`, and take row locks.
- **Two members, maximum** — enforced in `accept_invitation` *and* by a trigger that applies to any insert from any code path.
- **One space per account** — a partial unique index.
- Profiles: you can edit only your own name and time zone; your partner's profile is read-only to you.
- The frontend only ever holds the public anon key. No service-role key exists anywhere in this repo or in Vercel.
- Route guards in React are for navigation only; they are not the security boundary.

## Tests

```bash
npm test        # unit tests: Monday 12:00 UTC release maths (Malaysia / Chile summer + winter), invite link parsing
npm run test:db # spins up a throwaway PostgreSQL, applies migrations, runs security tests
npm run build   # typecheck + production build
```

`npm run test:db` needs PostgreSQL 15+ binaries installed locally. It covers 45 checks, including: anonymous users can't read or call
anything; outsiders see nothing; tokens are stored hashed; a used link is refused for a third person; the creator can't redeem their own
link; expired and replaced links fail; a member can't edit their partner's profile; direct inserts are refused; and **two people
redeeming the same link at the same instant → exactly one gets in**.

## Database

| Table | Purpose |
|---|---|
| `profiles` | display name, time zone (auto-created on sign-up) |
| `relationships` | the shared space (`pending` → `active`) |
| `relationship_members` | who is in the space (max two active) |
| `invitations` | hashed one-time invitation tokens |

Migrations live in `supabase/migrations/` and are applied in order. History is never deleted by later migrations.

## Roadmap

1. ✅ Foundation — auth, space, invitation, two-member limit
2. Weekly activity — 42 activities, Monday 12:00 UTC generator (`pg_cron`), no repeats per cycle
3. Submission & reveal — drafts, private-until-both-submit, enforced by RLS
4. Weekly check-in · 5. Mailbox · 6. Scrapbook · 7. Creative Corner · 8. Timeline
