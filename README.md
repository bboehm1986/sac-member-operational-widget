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
fields, the waiver-trend field/logic, and the three cubes this widget
binds to. `BUILD_PLAN_FOR_AHMED.md` has the drafted (not yet deployed)
Gold SQL and cube definitions for all three.

## Two lessons carried over from the start, same as the rest of this suite

- **No in-widget filter controls.** Filtering belongs in a native SAC
  Input Control, wired to the underlying data source — SAC's Optimized-
  story View mode doesn't deliver internal click/change events to a
  custom widget's shadow DOM (confirmed twice already elsewhere in this
  suite).
- **No theme toggle, light theme only.** Same reason.

## Files

- `widget.json` — manifest: properties (`width`, `height`, `asOfLabel`),
  three data bindings (`enrollmentStatusByWave`, `electionSummary`,
  `waiverTrend`), one exposed scripting method (`refresh`).
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

## Data bindings — what they expect

All three are pre-aggregated cubes, never Gold-layer member-level rows.

- **`enrollmentStatusByWave`** ← `DS_MEMBER_ENROLLMENT_SUMMARY` — the
  *same* cube the Snap widget binds to; this widget just renders the full
  per-Wave status breakdown instead of headline Set Up/Completed tiles.
  **Also carries `TotalEligibleLives`/`TotalCoveredLives`** (added
  2026-09-22, `SUM` of `vDimMember`'s own `EligibleCount`/
  `HealthCoveredCount` — member plus eligible/covered dependents, a
  current snapshot, not a year-over-year trend; that's a separate,
  still-open effort Blair is pursuing directly with Ahmed).
- **`electionSummary`** ← `DS_MEMBER_ELECTION_SUMMARY` — one row per
  Wave, current-cycle scoped; HSA/FSA/Supp Life ×3/Retirement ×2
  count+average measures, plus a plain Vision election count.
- **`waiverTrend`** ← `DS_MEMBER_WAIVER_TREND` — one row per (cycle,
  Membership Type), **unscoped** by cycle (both 2026 and 2027 need to be
  present for the trend to mean anything).

## Status of this build

- ✅ Widget scaffold, layout, and rendering logic — done, verified locally
  against mock data (see `preview.html`); no console errors.
- ⏳ Not yet hosted on GitHub Pages or registered in SAC.
- ⏳ Blocked on real data — none of the three cubes have been deployed
  yet. `enrollmentStatusByWave` reuses an existing (already-deployed, but
  not yet rebuilt with the `AE_EventRqsts`/`vDimMember` joins) cube;
  `electionSummary` and `waiverTrend` are fully drafted in
  `BUILD_PLAN_FOR_AHMED.md` but not yet built in Datasphere at all.
- ✅ **Covered Lives added 2026-09-22.** `vEmployerMemberCount` was
  originally going to migrate here for "enrollment-volume YoY," but
  reading Ahmed's actual deployed `vDimMember` source showed something
  different: `EligibleCount`/`HealthCoveredCount`, a per-member family-
  size *snapshot* (no `EnrollmentYear` dimension at all) — not the YoY
  trend originally planned. Built against that real shape instead of the
  originally-assumed one.
- 🚫 **Gated 2026-09-23 — do not deploy `TotalEligibleLives`/
  `TotalCoveredLives` against real data yet.** `vDimMember` was
  restructured the next day into one row per (Member, `EnrollmentYear`)
  — good news for eventual YoY trending, but it also means the
  `Membership_Type`/`Eligible_Count`/`Health_Covered_Count` join drafted
  in `BUILD_PLAN_FOR_AHMED.md` needed a fix (an `EnrollmentYear` match
  added, or it would have fanned out 3x) — now fixed. Separately,
  `EligibleCount`/`HealthCoveredCount` had two flagged findings
  (`data-catalogue/products/vdimmember.md` BR-20/BR-21) — **BR-20
  resolved 2026-09-23 by Blair: the `+1` is deliberate** (the aggregation
  only counts dependents, `+1` adds the member back in for a true family-
  size count), not a bug. **BR-21 remains open**: `EligibleCount` likely
  doesn't actually vary by `EnrollmentYear` per member (its `AS_OF` isn't
  parameterized per branch, unlike `HealthCoveredCount`'s, which does
  vary correctly). The widget code and cube design are ready; confirm
  BR-21 with Ahmed before wiring real data through this tile.
- ⏳ **Not in this widget, deliberately parked:**
  - **EOI (Evidence of Insurability) counts** — explicitly TBD per Blair,
    "TBD on script" — belongs on a possible future iteration of this
    widget, not built now.
  - **True enrollment-volume year-over-year trending** — Covered Lives
    above is a current snapshot, not a trend. Restoring real YoY
    capability is a separate, still-open effort Blair is pursuing
    directly with Ahmed. The widget's `notice` banner surfaces this as an
    open item rather than silently implying the snapshot is a trend.

## Next steps (once ready)

1. Host `main.js`/`icon.svg` on GitHub Pages, matching `widget.json`'s
   hardcoded URLs (`bboehm1986.github.io/sac-member-operational-widget/...`).
2. Register in SAC (System → Custom Widgets → Add Custom Widget).
3. Deploy the drafted Gold SQL and all three cubes per
   `BUILD_PLAN_FOR_AHMED.md`, then bind `enrollmentStatusByWave`/
   `electionSummary`/`waiverTrend` to the real models.
4. Add a native SAC Input Control for Wave/Status filtering, wired to the
   same models — not built into the widget, per the lesson above.
5. Revisit EOI once it's no longer parked, and add true YoY volume
   trending once Blair/Ahmed restore that capability.
