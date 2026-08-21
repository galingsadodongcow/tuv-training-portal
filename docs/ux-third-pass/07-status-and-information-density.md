# 07 — Status & information density

## The problem: 19+ status systems, 14 reused pill classes, 3 "health" vocabularies

The app exposes **19+ distinct status/label systems** (~190 pill usages across 34 files) built on **14 `pill-*` classes + 5 `health-*` classes**. Because the classes are reused across enums, **the same colour means different things on different screens** — e.g. `pill-cancelled` renders a Lost inquiry, a Won-inquiry badge, a Declined quote, a Failed comm, and an archived year.

Worse, **three independent "attention" vocabularies overlap in meaning**:
- `orderState.ts` → order flags (Stalled, Paid-not-endorsed, Overdue, Due soon, No owner, No feedback)
- `health.ts` → session health (Blocked, At Risk, Needs Attention, Healthy)
- `leadHealth.ts` → lead/quote health (Stalled, Ageing, Won, Lost, Expiring)

"Stalled" / "At risk" / "Ageing" all express *the same idea* in three different label+colour schemes.

## Target: three signal families, one visual language

Every record should carry at most **three** orthogonal signals:

1. **Process status** — where it is in its lifecycle (session: Tentative→Confirmed→Running→Completed; order stage; inquiry stage; quote status). *One* status pill per record.
2. **Health** — is it on track? A single 3-level scale (**OK / At risk / Blocked**) computed per entity, reusing one colour set (green / amber / red) everywhere — sessions, orders, and leads all map their conditions onto it.
3. **Ownership** — who holds it (owner name/avatar), plus a priority marker *only* where a queue needs ordering.

Everything else (Private run, Roster locked, Paid, Channel, Waitlisted) is an **attribute**, shown as quiet text or a single neutral chip — not a coloured status pill.

## Concrete reductions
- **Collapse the 3 health vocabularies into one** `health` module with a shared `{ok|risk|blocked}` scale + labels. `orderState` flags and `leadHealth` become *inputs* that map onto it, not separate pill systems. (−2 vocabularies, −1 colour scheme.)
- **Stop reusing pill classes across meanings.** Map each of the 3 signal families to its own colour role; retire the decorative proximity pills (Today/This week/Soon) in favour of plain date text + the health colour.
- **One pill per cell.** Rows today can show Status + Go + Health + Risk + Urgency + Channel simultaneously (Calendar shows ~8 signals/row). Cap at **Status + Health + owner**; Fill is a bar; Go/No-Go is the *reason* behind health, shown on the record, not a second pill.
- **Session detail header 6 badges → 3** (Status, Health, one context chip).

## Information density (visual weight, 1366/1440px)
- **Fewer nested cards.** Overview panels wrap every block in a `.card`; let related rows sit together under one card with dividers. (DEN1 started this; extend it.)
- **My Work / Calendar / records** already read as enterprise-dense — keep that; the target is *calmer*, not bigger. Reduce toolbar rows (Calendar 7 filters → 4; Reports control bank → tabs).
- **Colour = meaning only.** After the pill consolidation, colour should appear for health and destructive actions, not for decoration or channel branding.

## Outcome
From "~8 signals on a calendar row / 19 status systems" to **Status + Health + Owner** everywhere, one colour language. This is the single highest-leverage *comprehension* simplification — it doesn't remove screens, it removes the mental translation tax on every screen.
