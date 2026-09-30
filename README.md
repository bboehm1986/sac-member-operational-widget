# AE Member Enrollment Operational Dashboard — SAC Custom Widget

A custom widget for SAP Analytics Cloud rendering the Member Enrollment
**working-team/operational dashboard**: the full Enrollment Status
breakdown by Wave (all five statuses, not just Set Up/Completed),
election-detail counts and averages (HSA/FSA/Supplemental Life/
Retirement/Vision), and a waiver trend by membership type (Sponsored vs.
Retired). This is the second widget of a **3-widget suite** (see
[`../ae-member-enrollment-report/GOLD_VIEW_SPEC.md`](../ae-member-enrollment-report/GOLD_VIEW_SPEC.md)
§10l) mirroring the Employer Election suite's structure — this widget
plays the same role [AE Employer Election Operational](../sac-ae-operational-widget)
does there. Headline leadership tiles live on the sibling
[AE Member Enrollment (Snap)](../sac-member-enrollment-widget) instead;
per-member row detail lives on `sac-member-detail-widget`.

**Design doc:** `GOLD_VIEW_SPEC.md` §10d–§10k define the election-detail
fields and waiver-trend logic. `BUILD_PLAN_FOR_BLAIR.md`'s **"SUPERSEDED
— consolidated into ONE aggregate cube"** section has the current
authoritative architecture and SQL — **this widget binds to a single
consolidated Analytic Model (`AM_MEMBER_ENROLLMENT_SUMMARY`) shared with
`sac-member-enrollment-widget` (Snap)**, not three separate cubes as
originally designed. That redesign happened 2026-09-30 after discovering
a SAC custom widget can only bind to one Analytic Model total, no matter
how many named `dataBindings` its `widget.json` declares.

## Two lessons carried over from the start, same as the rest of this suite

- **No in-widget filter controls.** Filtering belongs in a native SAC
  Input Control, wired to the underlying data source — SAC's Optimized-
  story View mode doesn't deliver internal click/change events to a
  custom widget's shadow DOM (confirmed twice already elsewhere in this
  suite).
- **No theme toggle, light theme only.** Same reason.

## Files

- `widget.json` — manifest: properties (`width`, `height`, `asOfLabel`),
  a single `aggregateData` data binding (22 measures, 8 dimensions — see
  below), one exposed scripting method (`refresh`).
- `main.js` — defines the `<com-porticobenefits-memberoperations>` custom
  element. Renders: a Covered Lives tile row (Total Eligible/Covered
  Lives — a **current-snapshot** family-size count, member plus eligible/
  covered dependents, added 2026-09-22 — see the note below, this is
  *not* a year-over-year trend), a per-Wave panel row with the complete
  Enrollment Status breakdown (Success/Started-Not-Completed/Not Started/
  In Progress/Needs Follow-up, each with count and %), three election-
  detail panels (Health Savings Vehicles, Supplemental Life, Retirement &
  Vision) with count + weighted-average-amount tiles, and a waiver-trend
  panel row (one per Membership Type) comparing the 2026 vs. 2027 waived
  rate with a delta indicator. Falls back to built-in mock data when no
  data binding is bound, so the whole layout is reviewable standalone.
- `icon.svg` — icon shown in the SAC widget panel (copied from the Snap
  widget — same family, same icon).
- `preview.html` — standalone local test harness; drives the widget
  through the real `onCustomWidgetBeforeUpdate`/`onCustomWidgetAfterUpdate`
  lifecycle hooks, same pattern as the rest of this suite.

## Data bindings — what it expects

**One binding, `aggregateData`**, shared with `sac-member-enrollment-
widget` (Snap) — both bind to the same `AM_MEMBER_ENROLLMENT_SUMMARY`
model, each filtering client-side by a `RowKind` discriminator dimension.
This widget reads three row-kinds (`StatusByWave`, `ElectionSummary`,
`WaiverTrend`); the fourth (`DailyTrend`) exists on the same model for
Snap's timeline. See `main.js`'s own header comment for the exact
dimension/measure order (SAC binds by position, not name — order matters
when binding in the SAC Builder panel: Measures before Dimensions, then
each list in the documented order).

Never Gold-layer member-level rows directly. See `BUILD_PLAN_FOR_BLAIR.md`'s
"SUPERSEDED — consolidated into ONE aggregate cube" section for the full
cube SQL and design. `TotalEligibleLives`/`TotalCoveredLives` (in the
`StatusByWave` row-kind) are still `NULL` placeholders pending BR-29 — see
below.

## Status of this build

- ✅ Hosted on GitHub Pages, registered in SAC, bound and **confirmed
  working against real data** (2026-09-30).
- ✅ **Covered Lives added 2026-09-22.** `vEmployerMemberCount` was
  originally going to migrate here for "enrollment-volume YoY," but
  reading Ahmed's actual deployed `vDimMember` source showed something
  different: `EligibleCount`/`HealthCoveredCount`, a per-member family-
  size *snapshot* (no `EnrollmentYear` dimension at all) — not the YoY
  trend originally planned. Built against that real shape instead of the
  originally-assumed one.
- 🚫 **Gated — verified 2026-09-29, `vDimMember` join confirmed broken,
  reverted to placeholders.** `vDimMember`'s "final version" (deployed
  2026-09-25) fixed BR-21 (`EligibleCount` now genuinely varies by
  `EnrollmentYear`), but Blair actually built and tested the join against
  real data and the fan-out check found **26 of 113 rows with duplicate
  `(Member, EventDate)` keys, up to 4 rows for one member** — confirming
  **BR-29** (`MemberKey` isn't unique within an `EnrollmentYear`, due to
  multiple personnel assignments per member; the same fields
  `Membership_Type` is built from can differ across those duplicate rows,
  so `Membership_Type` — and the waiver-trend tile built on it — is
  affected too, not just Covered Lives) is not resolved in this
  environment yet. **BR-25** (a separate `ZV_Covered_Count` double-count
  risk) is also still open. The `vDimMember` join has been removed
  entirely from Gold (not just flagged — same treatment as the earlier
  `AE_EE` bug); `Membership_Type`/`Eligible_Count`/`Health_Covered_Count`
  are `NULL` placeholders for now. **Tracked TODO — come back once Ahmed
  confirms/fixes BR-29 (and BR-25):** re-run the fan-out check against
  whatever he ships, and if clean, restore the join using the "Restore
  once BR-29 is confirmed fixed" section already written in
  `BUILD_PLAN_FOR_BLAIR.md` — don't just assume a status update means it
  landed.
- ⏳ **Not in this widget, deliberately parked:**
  - **EOI (Evidence of Insurability) counts** — explicitly TBD per Blair,
    "TBD on script" — belongs on a possible future iteration of this
    widget, not built now.
  - **True enrollment-volume year-over-year trending** — Covered Lives
    above is a current snapshot, not a trend. Restoring real YoY
    capability is a separate, still-open effort Blair is pursuing
    directly with Ahmed. The widget's `notice` banner surfaces this as an
    open item rather than silently implying the snapshot is a trend.

## Next steps

1. Add a native SAC Input Control for Wave/Status filtering, wired to the
   same model — not built into the widget, per the lesson above.
2. Revisit EOI once it's no longer parked, and add true YoY volume
   trending once Blair/Ahmed restore that capability.
3. Once BR-29 is confirmed fixed and the `vDimMember` join is restored in
   Gold, `TotalEligibleLives`/`TotalCoveredLives` and the `WaiverTrend`
   row-kind's `Membership_Type` will start populating for real — no widget
   change needed, they're already wired up as placeholders.
