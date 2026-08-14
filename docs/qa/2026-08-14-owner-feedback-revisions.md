# Owner feedback revisions — 2026-08-14

Six observations from the portal owner, and what each turned into. Two of them
needed far less work than expected and one needed a new security model, so the
findings are recorded here alongside the changes.

## 1. Calendar for every role

**Finding: this was a navigation omission, not an access problem.** RLS on
`schedule` is already `p_sched_r … using (true)` — every authenticated role could
always read it — and `/calendar/page.tsx` carries no `<Guard>` at all. The only
thing hiding the calendar was the `NAV` list in `src/lib/roles.ts`.

- Added `sales`, `sales_manager`, `management` and `auditor` to the calendar nav.
- Widened `canSell` to include `coordinator`.
- **`sales_manager` is deliberately *not* in `canSell`.** "Book" links into
  `/sales-entry`, and RLS allows `INSERT` on `orders` only to `sales`
  (`p_orders_sales_i`), `coordinator` (`p_orders_coord_i`) and `super_admin`.
  Offering a supervisor the button would raise an RLS error on save.
- Session editing stays with operations/super_admin (`p_sched_w`).
  **business_owner is view-only by decision** — granting it edit rights would
  have required widening `p_sched_w`, which was not wanted.

## 2. Team membership and delegated roles

The largest change, and the only one that needed a new security model.
`profiles` was writable only by super_admin and readable only by *yourself*, so
operations and sales supervisors could not see their own people.

`supabase/migrations/20260814060000_team_membership_delegation.sql` adds scoped
`SECURITY DEFINER` RPCs — `fn_team_members`, `fn_grant_member_role`,
`fn_link_member_salesperson`, `fn_upsert_team_member`, plus the
`fn_member_grantable_roles` / `fn_can_manage_member` helpers. **Table RLS is
unchanged**: widening `profiles` for two more roles would have exposed every
column of every user, so the RPCs are the only widened path and each re-checks
the caller.

The delegation matrix is the security boundary — roles are grantable *downward*
only, so nobody can mint an account with more authority than they hold:

| Delegator | May grant |
|---|---|
| `super_admin` | any role |
| `operations` | `sales`, `coordinator`, `sales_manager` |
| sales supervisor | `sales`, **own team only** |
| everyone else | nothing |

Three further invariants: nobody may change their own role; only a super_admin
may act on an existing super_admin; a supervisor's team is forced server-side
(passing another team is ignored, not honoured). Every grant and roster write
lands in `audit_log`.

**Accounts are still not created in-app** — the browser holds the anon key and
cannot call the Auth admin API. Per the agreed approach, a person signs in once
(which provisions their profile row) and is then given a role and team here. An
invite Edge Function using the service key remains the follow-up option.

`/admin` is now capability-driven rather than `super_admin`-only, and opens to
`operations` and `sales_manager`.

## 3. Trainer and venue codes

**Finding: the permissions were already correct** — `canEdit` and the
`trainer_write` / `venue_write` policies are both operations/super_admin, so
nothing there needed changing.

What was wrong was the codes: `trainer.code` was a free-text box (easy to leave
blank, duplicate or typo) and **`venue` had no code column at all**.
`20260814050000_auto_trainer_venue_codes.sql` generates both in the database —
sequences plus `BEFORE INSERT` triggers producing `TR-nn` / `VN-nn`, matching the
`TR-01` codes already in use. Done in the DB, not the client, because two
browsers can race and the app is not the only writer (seeds and the SQL editor
insert too). Existing rows are backfilled and case-insensitive unique indexes
added. An explicit code is still honoured if one is passed.

Manage-surface optimisations shipped: search across name/code/email/city, an
active-only default with a "show inactive" toggle and a hidden count.

Further optimisations recommended but **not** implemented (kept out of scope):
inline edit rather than only Deactivate, utilisation and double-booking warnings
on the row, trainer↔course competency shown before booking, and merge-duplicate
handling.

## 4. Saved views — the star is gone

The ★ was doing two unrelated jobs (marking read-only role defaults *and*
labelling the save button), which is why it read as a rating rather than a state.
Replaced with the chosen option: chips with no star, a plain **Default** badge on
shared role views, a "Save current filters" button, and a new **active-filter
summary** row spelling out exactly what is narrowing the list, each filter
individually removable plus "Clear all".

## 5. Session drawer now shows the full tabs

The calendar drawer was a hand-rolled summary that had already drifted behind the
full page. Rather than rebuild tabs inside it, `SessionDetail`'s body was
extracted into `src/components/SessionRecord.tsx` and is now rendered by **both**
the `/session/[id]` route and the drawer, so the two cannot diverge again.

The drawer keeps its inline trainer/venue quick-assign (with conflict warnings)
above the shared record, and its width went 500px → 760px so order tables and the
roster are usable. Tab state is local in the drawer and URL-backed (`?tab=`) on
the page.

## 6. Assigning an order owner

Order details showed the owner but offered no way to set it — the working picker
existed only in the fulfilment queue. Extracted into
`src/components/OwnerAssign.tsx` and used by both surfaces, so one implementation
serves the queue row and the record header. RLS already permitted this
(`p_asg_admin` / `p_asg_ops` / `p_asg_lead_*` / `p_asg_coord`); a sales rep still
only gets "assign to me" on an unowned order (`p_asg_sales_i`).

The shared `canAssignAnyOwner` helper also picks up the **coordinator**, which
`p_asg_coord` allows but the queue's local check had missed.

## Verification

- `npx tsc --noEmit`, `eslint . --max-warnings=0` — clean
- `npm test` — 7 unit tests pass
- `npm run build` — production build passes
- `npm run test:e2e` — 8 Chromium tests pass, including the WCAG A/AA scan
- Migration parity check — both new migrations referenced in the bundle
- **Both migrations validated on a throwaway PostgreSQL 16**, not just reviewed:
  - auto-codes: backfill correct, trigger assigns the next code, explicit codes
    honoured, case-insensitive duplicates rejected, re-apply is a clean no-op.
    An off-by-one was caught and fixed this way (the first venue came out `VN-02`
    because `setval(..., true)` skips a number on an empty register).
  - delegation: every boundary exercised as super_admin, operations, a supervisor
    and a rep — escalation to `super_admin` denied, self-promotion denied,
    cross-team access denied, `business_owner` refused to operations, `sales_id`
    cleared when moving to a non-selling role, supervisor's team forced on insert.

## Not yet applied to the live database

Both migrations are **committed but not deployed**. They are idempotent, but the
delegation one changes who can grant roles, so it should be applied through
`.github/workflows/apply-supabase.yml` after review — then re-run the Security
and Performance advisors and re-check role behaviour against live profile data.

---

## Live verification of the admin screen (2026-08-14, after deployment)

Both migrations were applied to the live project and the delegation was checked
by simulating each role against the real database (`set local role authenticated`
plus a `request.jwt.claims` sub), because no browser test account exists.

**Operations behaved correctly out of the box.** The ops account saw itself
(read-only), the two sales people, and — before the fix below — the business
owner. Both super admins were correctly hidden. Grant set was
`{sales, coordinator, sales_manager}`, and `can_manage_self` was false.

Three findings came out of it:

### 1. Oversight roles were exposed to operations — fixed
`fn_can_manage_member(<business owner>)` returned true for the ops account. Not a
privilege escalation (operations still cannot *grant* business_owner, so they
could not take the role), but operations could have demoted the business owner
and stripped senior oversight access. `20260814070000_protect_oversight_roles.sql`
extends the super_admin ring-fence to `business_owner`, `management` and
`auditor`. Re-verified live: the business owner no longer appears in the ops
list at all, and super_admin still sees all six users.

### 2. Supervisors were locked out of their own screen — fixed
The live "Test Supervisor" held the legacy `is_supervisor` flag while her *role*
was `sales`. The database treated her as a team lead (`fn_is_team_lead()` true,
grant set `{sales}`) but the route and nav were gated on `role = 'sales_manager'`,
so the UI blocked a capability the database granted. The two definitions of
"supervisor" were unified onto the `sales_manager` role.

### 3. sales_manager could not sell — fixed
Promoting a supervisor to `sales_manager` would have removed order creation.
**The gate is `fn_create_order`'s own allowlist, not RLS**: that function is
`SECURITY DEFINER` and bypasses the `orders` INSERT policies entirely, which is
why `operations` can create orders while having no INSERT policy at all. Adding
an RLS policy for `sales_manager` would have been dead code.
`20260814080000_sales_manager_can_sell.sql` adds `sales_manager` to the allowlist
with the same Inside Sales / Field Sales channel restriction as `sales`, and the
`/sales-entry` guard and calendar `canSell` were widened to match.

Verified with a write-free probe: as the supervisor, `fn_create_order` now fails
with `22004 An order reference is required` (past the role check) instead of
`42501 Your role may not create orders`; as the business owner it still returns
`42501`.

### Outstanding — data setup, not code
**Every salesperson record has a null `team`.** `fn_current_team()` returns null
for everyone, so a supervisor sees only themselves (0 manageable) and
`fn_upsert_team_member` refuses with "Your account has no team". Supervisor
delegation is correct but inert until teams are populated; operations and
super_admin are unaffected.
