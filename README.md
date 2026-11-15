# Our Little Ritual

*A little something, every week.*

A private, invite-only app for two people in a long-distance relationship.
React + TypeScript + Tailwind, Supabase (Auth, Postgres, Storage), deployed on Vercel.

**Status: Phase 5 — Play With Me** (live activities for video calls) on top of **Phase 4 — quick wins** (installable app, visit countdown, "thinking of you", best time to call) on top of
**the first complete version (Phase 3).** Accounts and pairing (1), one shared ritual every Monday at 12:00 UTC (2),
and answering it with words, photos, drawings or quick picks, sealed until you've both shared, then revealed together (3).

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

### Updating to a new phase
Run each new file in `supabase/migrations/` once, in number order, in **SQL Editor → New query → Run**.
- **Phase 2 — `0002_weekly_rituals.sql`**: adds the 42 activities, cycles and the weekly generator, and schedules it for
  Mondays 12:00 UTC with `pg_cron`. The result panel should end with *"Scheduled the weekly ritual for Mondays 12:00 UTC."*
  If it says it couldn't schedule, everything still works: the week's ritual is created the first time either of you opens the app.
  (Optional: enable **pg_cron** under Database → Extensions and run just the `do $cron$ … $cron$;` block again.)

- **Phase 3 — `0003_submissions_and_reveal.sql`**: adds answers (`activity_submissions`), the reveal rules, and a private
  storage bucket **ritual-media** for photos and drawings, with its access rules. Afterwards, **Storage** should list
  `ritual-media` marked *Private*. Nothing to change in Vercel.

- **Phase 4 — `0004_quick_wins.sql`**: adds `visits`, `nudges` and your usual free hours on `profiles`. Nothing to change
  in Vercel. To install the app: iPhone → open in Safari → Share → *Add to Home Screen*; Android → browser menu → *Install app*
  (Settings in the app shows the right steps for your phone).

- **Phase 5 — `0005_play_with_me.sql` then `0006_play_with_me_activities.sql`** (run both, in that order): the Play With Me
  tables, rules and the 90 activities. The first file also turns on Supabase **Realtime** for `play_sessions`, so a tap on one
  phone shows on the other within a second. If Realtime is off for your project the app still syncs every 3 seconds.

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

## Design system — "Retro Travel Journal"

| Token | Hex | Role |
|---|---|---|
| `cream` (Caesar Cream) | `#F4E7DE` | dominant page background (`paper` `#FBF5F0` for cards) |
| `leaf` (Salad Leaf) | `#20492F` | text, headings, navigation, colour-block panels |
| `raspberry` | `#E480B4` | playful primary accent: tickets, partner card, loops |
| `mustard` | `#ECB53D` | interactive: primary buttons, active nav |
| `tomato` | `#DD3B26` | occasional emphasis: stamps, airmail edge, errors |

Fonts: **Fraunces** (soft, retro display serif) for headings, **Inter** for interface text, **Caveat** for small handwritten notes.
Components in `src/components/ui.tsx`: `Button` (mustard with a printed offset shadow), `Card` (postcard with inset rule),
`Ticket` (notched label), `Stamp` (passport stamp), `Loops` / `LoopField` (overlapping-loop brand motif), plus `.airmail` edging in `index.css`.
Text pairs are chosen for contrast: leaf on cream/mustard ≥ 5:1; small text never sits on raspberry or tomato.

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

`npm run test:db` needs PostgreSQL 15+ binaries installed locally. It covers 206 checks. Phase 5: 90 activities (15 per
category, every mood/energy/type covered), one shared session for both partners, every filter respected, no repeats then a
reshuffle, "nothing matches" message, timer start/pause/reset maths, playing a chosen favourite, private vs shared favourites,
outsiders blocked, and both phones opening Play / tapping "another one" at the same instant. Earlier phases: 156 checks. Phase 4: visits shared between the
two of you and invisible to others, date validation, nudge rate limits (per minute and per day), no nudges before your
partner joins, free hours editable only by their owner. Unit tests cover the call-overlap maths for Kuching ↔ Santiago in
both Chile summer and winter time, windows past midnight, and "happening now". Earlier phases: Phase 3: a partner can't see a
draft, can't read a *sealed* answer before the reveal (even by filtering on its id), sees only "shared / not yet"; sealing
locks the answer; both see both answers after the second seal; outsiders see nothing; validation (length, https links,
image paths outside your own folder); storage — upload only to your own folder, partner's photo invisible until the reveal,
a sealed photo can't be deleted, outsiders never see files; and both partners sealing at the same instant. Phase 2: both partners get the identical
weekly record; 42 simulated weeks with no repeats, 7 per category, all six categories in every 6 weeks, never the same category
twice running; a new cycle after 42 with history kept; the Monday 12:00 UTC boundary (including Kuching vs Santiago times);
outsiders and pending spaces blocked; and both partners opening the app at the same instant → one shared record. Phase 1: anonymous users can't read or call
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
| `activities` | the 42 weekly ritual activities (read-only library) |
| `activity_cycles` | each run through all 42; a new one starts after the last |
| `weekly_activities` | the one shared ritual per couple per week (unique per week, no repeats per cycle) |
| `activity_submissions` | each person's answer: draft or sealed; the partner's is readable only after both are sealed |
| storage `ritual-media` | private photos and drawings at `<space>/<week>/<person>/<file>` |
| `visits` | planned visits for the countdown (either of you can add, edit, remove) |
| `nudges` | "thinking of you" taps (max one a minute, 30 a day) |
| `profiles.free_from / free_to` | when each of you is usually free, in your own local time |
| `play_activities` | the 90 Play With Me activities (read-only library) |
| `play_sessions` | one live session per call: filters, current activity, shared timer, round |
| `play_session_items` | every activity drawn in a session (done / skipped), for no-repeats and history |
| `play_favourites` | "Saved for me" (private) and "Our Favourite Things to Do" (shared) |

## How Play With Me stays in sync

- One open session per couple; whoever opens Play first starts it and the other phone joins it.
- The database draws the activity (matching your filters, no repeats within a round, reshuffle when you've played them all),
  so both phones always show the same one.
- The timer is stored as server timestamps; each phone corrects for its own clock, so both count down together. Either of
  you can start, pause, reset or pick 1/2/5/10 minutes.
- Updates arrive by Supabase Realtime, with a 3-second check as a fallback.

## How the sealed reveal works

- **Drafts** save to the server as you type and are visible only to you — never to your partner, even after the reveal.
- **Seal & share** locks your answer (no edits, no photo changes after that).
- **Before both have shared**, the database will not return your partner's answer to any request — not the text, not the
  photo, not via a direct query. Each of you can only see *whether* the other has shared ("shared" / "not yet").
- **When the second person seals**, both answers become readable to both of you at the same moment.
- Photos are shrunk on the phone (max 1600 px) before upload and opened through short-lived private links.
- Late answers are fine: any past week can still be answered.

## How the weekly ritual is chosen

- **One boundary for both of you:** Monday 12:00 UTC (8 pm in Malaysia, 9 am in Chile in summer / 8 am in winter).
- **Created on the server, once:** whoever opens the app first (or the Monday scheduler) triggers `ensure_current_ritual()`;
  it locks your space and creates the week's record. A unique constraint means a second record can't exist, so you both
  always see the same activity.
- **Fair:** each week picks the category used least so far in the cycle (never the same category two weeks running), then a
  random unused activity from it. In 42 weeks every activity appears once and each category 7 times; then it reshuffles.
- **No pressure:** every week counts as used whether or not you did it, so a quiet week never blocks the next one. History is kept forever.

Migrations live in `supabase/migrations/` and are applied in order. History is never deleted by later migrations.

## Roadmap

1. ✅ Foundation — auth, space, invitation, two-member limit
2. ✅ Weekly ritual — 42 activities, Monday 12:00 UTC generator, no repeats per cycle
3. ✅ Submission & reveal — drafts, private-until-both-submit, enforced by RLS and storage policies
4. ✅ Quick wins — installable app, visit countdown, "thinking of you", best time to call
5. ✅ Play With Me — 90 call activities, filters + Surprise us, live shared screen and timer, favourites, history
6. Call Session Mode · 7. The Curious Club · 8. Weekly check-in · 9. Mailbox · 10. Scrapbook · 11. Creative Corner · 12. Timeline
