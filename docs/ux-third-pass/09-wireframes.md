# 09 — Text wireframes (future state)

Hierarchy + actions only. `[ ]` = button, `‹ ›` = tab, `•` = row.

## Operations My Work (Action Queue)
```
My Work
────────────────────────────────────────────
⚠ Exceptions (5)                     [Filter ▾]
 • Session "ISO 9001 LA" below min · in 4d      → Open
 • Order 6080… paid, not endorsed · 3d          → Endorse
 • 2 possible duplicate orders                   → Resolve
 • Roster gap: "BOSH" 3 seats unfilled          → Roster
 • Approval: cancel "IRCA 27001" (BO)            → Decide
My tasks (3)                          [+ Task]
 • Call back Acme re: schedule · due today       [Done]
```
No KPI tiles. Every row = reason · owner/due · one action.

## Training Calendar (Calendar)
```
Calendar        [Month|Week|Day|List]   [Search][Status▾][Type▾]   [+ Session]
────────────────────────────────────────────
This week (default landing list)
 • Mar 12  ISO 9001 LA   Confirmed  ●OK   T:Cruz  V:Rm2  8/12
 • Mar 13  BOSH          Tentative  ▲Risk T:—     V:—    3/8
       (click → drawer)
┌ Drawer: BOSH · Mar 13 ─────────────┐
│ Status Tentative   Health ▲At risk │
│ Trainer [ assign ▾ ]  Venue [ ▾ ]  │
│ Participants 3/8      [Review]      │
│ [Confirm session]     More ▾        │
└────────────────────────────────────┘
```

## Training Catalogue (Directory)
```
Training                                   [+ Course]
────────────────────────────────────────────
Search  [Category ▾]
 • ISO 9001 Lead Auditor   Certification · IRCA   ₱—/₱—/—   [Edit ▾]
 • BOSH                    Professional          ₱—/₱—/—   [Edit ▾]
        (Edit ▾ → drawer: defaults + per-format fees)
```

## Course Detail / Edit (Record / drawer)
```
ISO 9001 Lead Auditor
Category ▸ Subcategory        Type: Certification
────────────────────────────────────────────
Defaults (inherit to sessions): Duration 5d · Min 8 · Max 10 · Cert IRCA
Fees:  Live ₱—   F2F ₱—   E-learning —
▸ Advanced: assessment · pass mark · cert validity · webshop URL
[Save]
```

## Create Session (modal/drawer)
```
New session
 Course        [ ISO 9001 LA ▾ ]
 Learning type [ Live Online ▾ ]
 Dates         [ + date block ]
 ▸ More options (fee, pax, trainer, venue, owner, status — all defaulted)
[Create session]
```

## Session Detail (Record)
```
ISO 9001 LA · Mar 12–16 · Live Online          [Confirm]  More ▾
Status Confirmed   Health ●OK   Owner Cruz
⚠ (none)
Trainer Cruz · Venue Rm2 · Fill 8/12 · Ready ✓
‹Overview  ‹Participants(8)  ‹Orders(3)  ‹Files  ‹Activity
```

## Resources (Directory + drawer)
```
Resources        [Trainers | Venues]        [+ Trainer]
 • Cruz   Associate   ISO,BOSH   12 sess  Next Mar12   [Manage ▾]
        (Manage ▾ → drawer: qualified courses · blackout dates)
```

## Sales My Work (Action Queue)
```
My Work
 Follow-ups due (4)                    [Filter ▾]
 • Acme — inquiry "RFQ sent" · overdue 2d     → Open
 • Beta — quote "Sent" 6d, no reply           → Open
 Returned orders (1)
 • Order 6081 returned: "missing session"     → Fix
 My tasks (2)
```

## CRM (Directory / workspace)
```
CRM        [Pipeline | Quotes | Orders]        [+ Inquiry] [+ Quote]
Pipeline (table default, Kanban toggle)
 Customer   Interest        Owner  Health  Next action     Due     Value
 • Acme     ISO 9001 LA     Cruz   ▲Age    Send quote      today   ₱120k
 • Beta     BOSH ×20        Cruz   ●OK     Call            Mar14   ₱80k
```

## Inquiry Detail (Record / drawer)
```
Acme — ISO 9001 LA                         [Advance ▾]  [Quote]
Stage RFQ sent   Health ▲Ageing   Owner Cruz
Contact · Email · Phone · Est value ₱120k · 60% · close Mar30 · Source Referral
‹Overview  ‹Activity
```

## Customer 360 (Record)
```
Acme Corporation                    [New quote] [New order]  More ▾
Owner Cruz · Outstanding ₱40k · Lifetime ₱1.2M
‹Overview  ‹Contacts  ‹Commercial(orders·quotes·inquiries)  ‹Finance  ‹Activity
Overview: Related accounts (org grouping) · recent training · balance
```

## Order Detail (Record)
```
Acme — Order 6080…  · ₱120k · Mar 1        [Endorse to Ops]  More ▾
Stage For Order Creation   Health ●OK   Owner Cruz
⚠ Completeness: session missing on line 2
‹Overview  ‹Lines(2)  ‹Payments  ‹Files  ‹Activity
```

## Management Overview (Analytics landing)
```
Overview                                   [This quarter ▾]
Revenue ₱—  ·  Pipeline ₱—  ·  Receivables ₱— (overdue ₱—)  ·  Sessions this wk —
[Revenue] [Receivables] [Certificates] [Profitability] [Quality]   ← tabs
Charts: revenue by month/channel · at-risk sessions · top overdue accounts
(no edit controls anywhere)
```
