/*
    AE Member Enrollment — Operational Dashboard — SAC Custom Widget

    This is the "Operational" widget of a 3-widget suite (see
    ../ae-member-enrollment-report/GOLD_VIEW_SPEC.md §10l) mirroring
    sac-ae-operational-widget's role on the Employer side. Where the Snap
    widget (sac-member-enrollment-widget) shows headline Set Up/Completed
    tiles for leadership, this widget shows the fuller working detail day-
    to-day admin/ops staff need: the complete Enrollment Status breakdown
    per Wave (not just Set Up/Completed), election-detail counts/averages
    (HSA/FSA/Supplemental Life/Retirement/Vision), and a waiver trend by
    membership type (Sponsored vs. Retired).

    ONE PRE-AGGREGATED data binding (declared in widget.json) — never
    Gold-layer member-level rows directly, same governance as every other
    widget in this suite except sac-member-detail-widget.

    REDESIGNED 2026-09-30: a single SAC custom widget can only bind to one
    Analytic Model total, even if widget.json declares multiple named
    dataBindings (confirmed via the Employer Election project — a widget's
    bindings can't each point at a different model). The original 3-binding
    design (enrollmentStatusByWave / electionSummary / waiverTrend, three
    separate models) could never have worked. Fixed by consolidating
    DS_MEMBER_ENROLLMENT_SUMMARY/_DAILY/_ELECTION_SUMMARY/_WAIVER_TREND into
    ONE cube: DS_MEMBER_ENROLLMENT_SUMMARY, now a UNION ALL of 4 "row-kinds"
    (mirroring the Employer suite's own multiplexed-cube pattern), each
    populating only the dimensions/measures relevant to it and leaving the
    rest NULL, plus a RowKind discriminator column. One Analytic Model
    (AM_MEMBER_ENROLLMENT_SUMMARY) wraps that cube; this widget's single
    "aggregateData" binding reads the whole thing and filters by RowKind
    per panel.

    SAC's standard ResultSet row shape ({ data: [ { dimensions_0: {id,
    label}, ..., measures_0: {raw,formatted}, ... } ] }) — dimensions and
    measures MUST be added in the Builder panel in this exact order (SAC
    binds by position, not by name):

      Dimensions (9): RowKind, EventDate, Wave, Enrollment_Status,
                       Defaulted, Defaulted_Timing, ActivityDate,
                       Membership_Type, Is_Portico_Employee
      Measures (22):  MemberCount, MultipleAttemptsMemberCount,
                       TotalEligibleLives, TotalCoveredLives, WaivedCount,
                       HSA_Count, HSA_Avg_Amount, FSA_Health_Count,
                       FSA_Health_Avg_Amount, FSA_Dependent_Count,
                       FSA_Dependent_Avg_Amount, SuppLife_Member_Count,
                       SuppLife_Member_Avg_Amount, SuppLife_Spouse_Count,
                       SuppLife_Spouse_Avg_Amount, SuppLife_Dependent_Count,
                       SuppLife_Dependent_Avg_Amount, Retirement_Pretax_Count,
                       Retirement_Pretax_Avg_Amount, Retirement_Roth_Count,
                       Retirement_Roth_Avg_Amount, Vision_Election_Count

    RowKind values and which of the above they actually populate:
      - 'StatusByWave'    -> Wave, Enrollment_Status, Defaulted,
                              Defaulted_Timing / MemberCount,
                              MultipleAttemptsMemberCount,
                              TotalEligibleLives, TotalCoveredLives
      - 'DailyTrend'      -> Wave, Enrollment_Status, ActivityDate /
                              MemberCount   (not rendered by this widget
                              today -- Snap's own timeline uses this;
                              kept here since it's the same one model)
      - 'ElectionSummary' -> Wave / HSA..Vision_Election_Count
      - 'WaiverTrend'     -> EventDate, Membership_Type / MemberCount,
                              WaivedCount

    ADDED 2026-10-01 (per Blair): Is_Portico_Employee -- Portico's own
    employees are EXCLUDED from this widget's numbers entirely, via a
    check built into _rowsOfKind() so every row-kind read by this widget
    gets it automatically. The mirror widget showing ONLY Portico
    employees is sac-member-operational-portico-widget -- same model,
    same code shape, opposite filter.

    Known caveat: the *_Avg_Amount measures are pre-computed averages at
    the Wave grain (from DS_MEMBER_ENROLLMENT_SUMMARY's own GROUP BY) —
    marked SUM on the Analytic Model only because that's the only
    aggregation type available for a measure. They are NOT safe to
    aggregate further across Wave. Always read them per-Wave (as this
    widget already does via _weightedTotal), never request them without
    Wave also present.

    Wave = NULL rows (no AE_EventRqsts tag matched) are deliberately left
    out of every panel below, per Blair's explicit 2026-09-29 decision —
    not surfaced as an "Unassigned" bucket. Revisit if that decision
    changes.

    No in-widget filter controls, no theme toggle, light theme only — same
    reasoning as every widget in this suite: SAC's Optimized-story View
    mode doesn't deliver internal click/change events to a custom widget's
    shadow DOM. Filtering belongs in a native SAC Input Control.

    Not yet bound to real data for ElectionSummary/WaiverTrend as of this
    header being written — renders from MOCK_* constants below so the
    layout can be built and reviewed standalone (see preview.html).

    Not in this widget: EOI (Evidence of Insurability) counts — explicitly
    parked per Blair for a future iteration, "TBD on script." True
    enrollment-volume year-over-year trending — Total Eligible/Covered
    Lives (above) is a current-snapshot family-size count, not a YoY
    trend; restoring real YoY trending capability is a separate, still-
    open effort Blair is pursuing directly with Ahmed.

    No in-widget "open items"/caveat banners, by Blair's explicit decision
    (2026-10-05): open items are tracked in the working session, never
    rendered on the dashboard.
*/
(function () {
    "use strict";

    const WAVES = ["Wave 1", "Wave 2a", "Wave 2b", "Wave 3"];
    const STATUSES = ["Success", "Abandoned", "Not Started", "In Progress", "Needs Follow-up"];
    const STATUS_LABELS = { "Success": "Completed", "Abandoned": "Started, Not Completed", "Not Started": "Not Started", "In Progress": "In Progress", "Needs Follow-up": "Needs Follow-up" };

    // ---- Mock data (mirrors the real SAC ResultSet row shape) ----
    // Dimension order (9): RowKind, EventDate, Wave, Enrollment_Status,
    //                       Defaulted, Defaulted_Timing, ActivityDate,
    //                       Membership_Type, Is_Portico_Employee
    // Measure order (22): MemberCount, MultipleAttemptsMemberCount,
    //   TotalEligibleLives, TotalCoveredLives, WaivedCount, HSA_Count,
    //   HSA_Avg_Amount, FSA_Health_Count, FSA_Health_Avg_Amount,
    //   FSA_Dependent_Count, FSA_Dependent_Avg_Amount, SuppLife_Member_Count,
    //   SuppLife_Member_Avg_Amount, SuppLife_Spouse_Count,
    //   SuppLife_Spouse_Avg_Amount, SuppLife_Dependent_Count,
    //   SuppLife_Dependent_Avg_Amount, Retirement_Pretax_Count,
    //   Retirement_Pretax_Avg_Amount, Retirement_Roth_Count,
    //   Retirement_Roth_Avg_Amount, Vision_Election_Count
    function row(dims, measures) {
        const out = {};
        dims.forEach((d, i) => { out["dimensions_" + i] = { id: d, label: d }; });
        measures.forEach((m, i) => { out["measures_" + i] = { raw: m, formatted: m == null ? "" : String(m) }; });
        return out;
    }

    // measures_2/3 (Total Eligible/Covered Lives) approximate a ~2.1
    // average family size, covered slightly below eligible -- illustrative
    // mock ratios only, not derived from any real distribution.
    // isPortico defaults to "No" -- this widget's own mock population is
    // the general (non-Portico) member base it's meant to show.
    function rowStatusByWave(wave, status, defaulted, defaultedTiming, count, multi, isPortico) {
        return row(
            ["StatusByWave", null, wave, status, defaulted, defaultedTiming, null, null, isPortico || "No"],
            [count, multi, Math.round(count * 2.1), Math.round(count * 1.85), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
        );
    }
    function rowElectionSummary(wave, values17, isPortico) {
        return row(
            ["ElectionSummary", null, wave, null, null, null, null, null, isPortico || "No"],
            [null, null, null, null, null].concat(values17)
        );
    }
    function rowWaiverTrend(cycle, type, count, waived, isPortico) {
        return row(
            ["WaiverTrend", cycle, null, null, null, null, null, type, isPortico || "No"],
            [count, null, null, null, waived, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
        );
    }

    const MOCK_AGGREGATE_DATA = { data: [
        rowStatusByWave("Wave 1", "Success", "No", "N/A", 610, 140),
        rowStatusByWave("Wave 1", "Abandoned", "No", "N/A", 35, 28),
        rowStatusByWave("Wave 1", "In Progress", "No", "N/A", 8, 3),
        rowStatusByWave("Wave 1", "Not Started", "Yes", "Before PSP", 25, 0),
        rowStatusByWave("Wave 1", "Not Started", "Yes", "After PSP", 12, 0),
        rowStatusByWave("Wave 1", "Needs Follow-up", "No", "N/A", 15, 6),
        rowStatusByWave("Wave 2a", "Success", "No", "N/A", 340, 55),
        rowStatusByWave("Wave 2a", "Abandoned", "No", "N/A", 18, 12),
        rowStatusByWave("Wave 2a", "In Progress", "No", "N/A", 5, 1),
        rowStatusByWave("Wave 2a", "Not Started", "Yes", "Before PSP", 14, 0),
        rowStatusByWave("Wave 2a", "Not Started", "Yes", "After PSP", 6, 0),
        rowStatusByWave("Wave 2a", "Needs Follow-up", "No", "N/A", 9, 4),
        rowStatusByWave("Wave 2b", "Success", "No", "N/A", 480, 60),
        rowStatusByWave("Wave 2b", "Abandoned", "No", "N/A", 22, 15),
        rowStatusByWave("Wave 2b", "In Progress", "No", "N/A", 11, 2),
        rowStatusByWave("Wave 2b", "Not Started", "Yes", "N/A", 31, 0),
        rowStatusByWave("Wave 2b", "Needs Follow-up", "No", "N/A", 13, 5),
        rowStatusByWave("Wave 3", "Success", "No", "N/A", 42, 6),
        rowStatusByWave("Wave 3", "Abandoned", "No", "N/A", 2, 1),
        rowStatusByWave("Wave 3", "Not Started", "Yes", "N/A", 5, 0),

        rowElectionSummary("Wave 1", [312, 1450, 96, 890, 41, 610, 28, 75000, 19, 42000, 22, 31000, 88, 340, 54, 190, 190]),
        rowElectionSummary("Wave 2a", [175, 1390, 52, 870, 23, 590, 15, 68000, 11, 39000, 12, 29500, 49, 320, 31, 175, 108]),
        rowElectionSummary("Wave 2b", [201, 1200, 60, 810, 27, 560, 17, 61000, 13, 35000, 14, 27000, 55, 295, 36, 160, 140]),
        rowElectionSummary("Wave 3", [14, 980, 4, 700, 2, 480, 1, 50000, 1, 30000, 1, 24000, 4, 260, 3, 140, 9]),

        rowWaiverTrend("2026-01-01", "Sponsored", 18, 2),
        rowWaiverTrend("2026-01-01", "Retired", 9, 3),
        rowWaiverTrend("2026-01-01", "Other", 54, 6),
        // Sponsored/2027 deliberately split into two rows (summing to the
        // same 612/96 as before) to prove _parseWaiverTrend accumulates
        // correctly now that WaiverTrend's real GROUP BY can return more
        // than one row per (type, cycle) -- see _parseWaiverTrend's comment.
        rowWaiverTrend("2027-01-01", "Sponsored", 400, 60),
        rowWaiverTrend("2027-01-01", "Sponsored", 212, 36),
        rowWaiverTrend("2027-01-01", "Retired", 340, 145),
        rowWaiverTrend("2027-01-01", "Other", 751, 78),
    ] };

    // ---- Template ----
    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                box-sizing: border-box;
                font-family: "72", "Segoe UI", Arial, sans-serif;
                /* Light mode only, by design — see file header. Same
                   glassmorphism system as the rest of the suite, copy-
                   pasted deliberately (each shadow root is isolated —
                   see sac-member-enrollment-widget's own note on this). */
                --mesh-1: rgba(106, 92, 240, 0.16);
                --mesh-2: rgba(47, 111, 224, 0.12);
                --mesh-3: rgba(20, 151, 111, 0.10);
                --surface: rgba(255, 255, 255, 0.58);
                --surface-2: rgba(23, 26, 35, 0.055);
                --border: rgba(255, 255, 255, 0.65);
                --text: #171a23;
                --text-soft: #5b6072;
                --accent: #6a5cf0;
                --accent-bg: rgba(106, 92, 240, 0.14);
                --success: #14976f;
                --success-bg: rgba(20, 151, 111, 0.14);
                --warning: #a5700c;
                --warning-bg: rgba(165, 112, 12, 0.14);
                --info: #2f6fe0;
                --info-bg: rgba(47, 111, 224, 0.14);
                --danger: #c94b4b;
                --danger-bg: rgba(201, 75, 75, 0.14);
                --glass-blur: blur(20px) saturate(180%);
                --shadow-card: 0 1px 1px rgba(23,26,35,0.03), 0 4px 12px -2px rgba(23,26,35,0.07), 0 14px 28px -10px rgba(23,26,35,0.10);
            }
            * { box-sizing: border-box; }

            .dashboard {
                width: 100%; height: 100%; overflow: auto;
                background:
                    radial-gradient(at 12% 8%, var(--mesh-1) 0%, transparent 45%),
                    radial-gradient(at 88% 14%, var(--mesh-2) 0%, transparent 45%),
                    radial-gradient(at 50% 100%, var(--mesh-3) 0%, transparent 50%),
                    #f4f5fa;
                color: var(--text); border-radius: 18px; padding: 18px;
            }

            .tile, .panel, .badge { backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); }
            @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
                .tile, .panel { background: rgba(255,255,255,0.94) !important; }
            }

            .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
            .eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 4px; }
            .topbar h1 { font-size: 19px; font-weight: 700; margin: 0; display: inline; }
            .titlewrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .badge { font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: 100px; border: 1px solid; white-space: nowrap; }
            .badge.accent { color: var(--accent); border-color: rgba(106,92,240,0.35); background: var(--accent-bg); }
            .badge.warning { color: var(--warning); border-color: rgba(165,112,12,0.35); background: var(--warning-bg); }
            .asof { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

            .section-title { font-size: 11.5px; font-weight: 700; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em; margin: 22px 0 8px; }
            .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
            .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; box-shadow: var(--shadow-card); }
            .panel-caption { font-size: 12px; color: var(--text-soft); margin: -6px 0 8px; }

            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
            .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 11px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--shadow-card); }
            .tile .label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-soft); }
            .tile .value { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); }
            .tile .sub { font-size: 10.5px; color: var(--text-soft); }

            .status-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--surface-2); }
            .status-row:last-child { border-bottom: none; }
            .status-row .n { font-weight: 600; font-variant-numeric: tabular-nums; }
            .status-row .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; }

            .waiver-row { display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; font-size: 12px; }
            .waiver-row .cycle { color: var(--text-soft); }
            .waiver-row .pct { font-weight: 700; font-variant-numeric: tabular-nums; }
            .trend-delta { font-size: 11px; font-weight: 700; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--surface-2); }
            .trend-delta.up { color: var(--danger); }
            .trend-delta.down { color: var(--success); }
            .trend-delta.flat { color: var(--text-soft); }

        </style>
        <div class="dashboard">
            <div class="topbar">
                <div>
                    <div class="eyebrow">2026 Annual Enrollment — Operational</div>
                    <div class="titlewrap">
                        <h1>Member Enrollment — Working Detail</h1>
                        <span class="badge accent" id="dataBadge">Mock Data — Preview</span>
                    </div>
                    <div class="asof" id="asof"></div>
                </div>
            </div>

            <div class="section-title">Covered Lives</div>
            <div class="grid" id="livesTiles"></div>

            <div class="section-title">Enrollment Status — by Wave</div>
            <div class="panels" id="statusByWavePanels"></div>

            <div class="section-title">Election Detail</div>
            <div class="panels" id="electionPanels"></div>

            <div class="section-title">Waiver Trend — by Membership Type</div>
            <div class="panels" id="waiverPanels"></div>
        </div>
    `;

    class MemberOperations extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));

            this._props = { width: 900, height: 750 };
            this._aggregateData = MOCK_AGGREGATE_DATA;
            this._usingMockData = true;
        }

        connectedCallback() {
            this._render();
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = Object.assign({}, this._props, changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            if ("width" in changedProperties) this.style.width = changedProperties.width + "px";
            if ("height" in changedProperties) this.style.height = changedProperties.height + "px";
            if ("aggregateData" in changedProperties) { this._aggregateData = changedProperties.aggregateData; this._usingMockData = false; }
            this._render();
        }

        onCustomWidgetDestroy() {
            // No timers/subscriptions held; nothing to tear down.
        }

        refresh() {
            this._render();
        }

        // ---- Parsing helpers ----
        // Dimension/measure indices below match the ONE consolidated
        // model's fixed column order documented in the file header --
        // RowKind is always dimensions_0.
        _dim(r, i) {
            const d = r["dimensions_" + i];
            return d ? d.label : "";
        }
        // A null measure (placeholder columns, or an average over zero
        // electors) can arrive as a non-numeric token, not a real null;
        // Number() of that is NaN and poisons every sum and weighted
        // average downstream. Anything non-finite counts as 0.
        _measure(r, i) {
            const m = r["measures_" + i];
            if (!m) return 0;
            const n = Number(m.raw);
            return Number.isFinite(n) ? n : 0;
        }
        // Excludes Portico's own employees (Is_Portico_Employee,
        // dimensions_8) from every row-kind this widget reads -- added
        // 2026-10-01 per Blair. Centralized here so no caller can forget it.
        _rowsOfKind(kind) {
            const rows = (this._aggregateData && this._aggregateData.data) || [];
            // Also excludes FLEX members (Wave "Group A".."Group F", added
            // 2026-10-05): they share this model but belong to the FLEX
            // dashboard (sac-flex-member-widget). Blank-Wave rows are kept.
            return rows.filter((r) => this._dim(r, 0) === kind && this._dim(r, 8) !== "Yes" && !/^Group /.test(this._dim(r, 2)));
        }

        _parseStatusByWave() {
            const rows = this._rowsOfKind("StatusByWave");
            const byWave = {};
            WAVES.forEach((w) => {
                byWave[w] = { total: 0, byStatus: {} };
                STATUSES.forEach((s) => { byWave[w].byStatus[s] = 0; });
            });
            let totalEligibleLives = 0, totalCoveredLives = 0;
            rows.forEach((r) => {
                const wave = this._dim(r, 2);
                const status = this._dim(r, 3);
                const count = this._measure(r, 0);
                totalEligibleLives += this._measure(r, 2);
                totalCoveredLives += this._measure(r, 3);
                if (!byWave[wave]) return;
                byWave[wave].total += count;
                if (byWave[wave].byStatus[status] !== undefined) byWave[wave].byStatus[status] += count;
            });
            return { byWave, totalEligibleLives, totalCoveredLives };
        }

        // Weighted average across Wave rows: sum(count_i * avg_i) / sum(count_i),
        // not a plain average-of-averages, so each electing member counts once.
        _weightedTotal(rows, countIdx, avgIdx) {
            let totalCount = 0, totalAmount = 0;
            rows.forEach((r) => {
                const c = this._measure(r, countIdx);
                const a = this._measure(r, avgIdx);
                totalCount += c;
                totalAmount += c * a;
            });
            return { count: totalCount, avg: totalCount ? totalAmount / totalCount : 0 };
        }

        _parseElectionSummary() {
            const rows = this._rowsOfKind("ElectionSummary");
            let visionCount = 0;
            rows.forEach((r) => { visionCount += this._measure(r, 21); });
            return {
                hsa: this._weightedTotal(rows, 5, 6),
                fsaHealth: this._weightedTotal(rows, 7, 8),
                fsaDependent: this._weightedTotal(rows, 9, 10),
                suppLifeMember: this._weightedTotal(rows, 11, 12),
                suppLifeSpouse: this._weightedTotal(rows, 13, 14),
                suppLifeDependent: this._weightedTotal(rows, 15, 16),
                retirementPretax: this._weightedTotal(rows, 17, 18),
                retirementRoth: this._weightedTotal(rows, 19, 20),
                visionCount,
            };
        }

        // Sums across cycle+type, not a per-row assign -- WaiverTrend's
        // GROUP BY was widened 2026-10-01 to also carry real Wave/Status/
        // Defaulted/Defaulted_Timing (so those dimensions are safe to
        // filter story-wide without blanking this panel), which means
        // multiple rows can now share the same (type, cycle). An
        // overwriting assign here would silently keep only the last one.
        _parseWaiverTrend() {
            const rows = this._rowsOfKind("WaiverTrend");
            const byType = {};
            rows.forEach((r) => {
                // SAC sends date labels locale-formatted ("Jan 1, 2026"), not
                // ISO, so key by the 4-digit year instead of matching the label.
                const yearMatch = /(20\d{2})/.exec(this._dim(r, 1));
                const cycle = yearMatch ? yearMatch[1] : this._dim(r, 1);
                // Members with no vDimMember row for their year arrive with an
                // empty / unassigned type (the label varies); by definition they
                // are neither Sponsored nor Retired, so they count as Other.
                const rawType = this._dim(r, 7);
                const type = (rawType === "Sponsored" || rawType === "Retired") ? rawType : "Other";
                const memberCount = this._measure(r, 0);
                const waivedCount = this._measure(r, 4);
                if (!byType[type]) byType[type] = {};
                if (!byType[type][cycle]) byType[type][cycle] = { memberCount: 0, waivedCount: 0 };
                byType[type][cycle].memberCount += memberCount;
                byType[type][cycle].waivedCount += waivedCount;
            });
            return byType;
        }

        // ---- Small render helpers ----
        _tileHtml(label, value, sub) {
            return `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
        }
        _money(n) {
            return "$" + Math.round(n).toLocaleString();
        }

        // ---- Rendering ----
        _render() {
            const root = this._shadowRoot;
            const { byWave: statusByWave, totalEligibleLives, totalCoveredLives } = this._parseStatusByWave();
            const election = this._parseElectionSummary();
            const waiver = this._parseWaiverTrend();

            root.getElementById("asof").textContent = "As of: " + new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            root.getElementById("dataBadge").textContent = this._usingMockData ? "Mock Data — Preview" : "Live";

            // Covered Lives — current-snapshot family-size totals (member +
            // eligible/covered dependents), NOT a year-over-year trend. See
            // notice at the bottom and GOLD_VIEW_SPEC.md §10k.
            root.getElementById("livesTiles").innerHTML = [
                this._tileHtml("Total Eligible Lives", totalEligibleLives.toLocaleString(), "members + eligible dependents"),
                this._tileHtml("Total Covered Lives", totalCoveredLives.toLocaleString(), "members + covered dependents"),
            ].join("");

            // Enrollment Status by Wave — one panel per Wave, all 5 statuses
            const statusDotColor = { "Success": "var(--success)", "Abandoned": "var(--danger)", "Not Started": "var(--warning)", "In Progress": "var(--info)", "Needs Follow-up": "var(--warning)" };
            root.getElementById("statusByWavePanels").innerHTML = WAVES.map((w) => {
                const d = statusByWave[w];
                const rowsHtml = STATUSES.map((s) => {
                    const count = d.byStatus[s];
                    const pct = d.total ? Math.round((count / d.total) * 100) : 0;
                    return `<div class="status-row"><span><span class="dot" style="background:${statusDotColor[s]};"></span>${STATUS_LABELS[s]}</span><span class="n">${count} <span style="color:var(--text-soft);font-weight:400;">(${pct}%)</span></span></div>`;
                }).join("");
                return `
                    <div class="panel">
                        <div class="section-title" style="margin-top:0;">${w}</div>
                        <div class="panel-caption" style="margin-top:-4px;">${d.total} total set up</div>
                        ${rowsHtml}
                    </div>`;
            }).join("");

            // Election Detail — grouped into 3 topic panels
            root.getElementById("electionPanels").innerHTML = `
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Health Savings Vehicles</div>
                    <div class="panel-caption" style="margin-top:-4px;">HSA &amp; FSA elections, current cycle</div>
                    <div class="grid">
                        ${this._tileHtml("HSA", election.hsa.count, election.hsa.count ? "avg " + this._money(election.hsa.avg) : "no elections")}
                        ${this._tileHtml("FSA — Health", election.fsaHealth.count, election.fsaHealth.count ? "avg " + this._money(election.fsaHealth.avg) : "no elections")}
                        ${this._tileHtml("FSA — Dependent", election.fsaDependent.count, election.fsaDependent.count ? "avg " + this._money(election.fsaDependent.avg) : "no elections")}
                    </div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Supplemental Life</div>
                    <div class="panel-caption" style="margin-top:-4px;">Three buckets, current cycle</div>
                    <div class="grid">
                        ${this._tileHtml("Member", election.suppLifeMember.count, election.suppLifeMember.count ? "avg " + this._money(election.suppLifeMember.avg) : "no elections")}
                        ${this._tileHtml("Spouse", election.suppLifeSpouse.count, election.suppLifeSpouse.count ? "avg " + this._money(election.suppLifeSpouse.avg) : "no elections")}
                        ${this._tileHtml("Dependent", election.suppLifeDependent.count, election.suppLifeDependent.count ? "avg " + this._money(election.suppLifeDependent.avg) : "no elections")}
                    </div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Retirement &amp; Vision</div>
                    <div class="panel-caption" style="margin-top:-4px;">Current cycle</div>
                    <div class="grid">
                        ${this._tileHtml("Retirement — Pretax", election.retirementPretax.count, election.retirementPretax.count ? "avg " + this._money(election.retirementPretax.avg) : "no elections")}
                        ${this._tileHtml("Retirement — Roth", election.retirementRoth.count, election.retirementRoth.count ? "avg " + this._money(election.retirementRoth.avg) : "no elections")}
                        ${this._tileHtml("Vision Elected", election.visionCount, "members")}
                    </div>
                </div>`;

            // Waiver Trend — one panel per Membership Type, 2026 vs 2027 waived rate
            const types = ["Sponsored", "Retired", "Other"];
            root.getElementById("waiverPanels").innerHTML = types.map((t) => {
                const d = waiver[t] || {};
                const prior = d["2026"] || { memberCount: 0, waivedCount: 0 };
                const current = d["2027"] || { memberCount: 0, waivedCount: 0 };
                const priorPct = prior.memberCount ? (prior.waivedCount / prior.memberCount) * 100 : 0;
                const currentPct = current.memberCount ? (current.waivedCount / current.memberCount) * 100 : 0;
                const delta = currentPct - priorPct;
                const deltaCls = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
                const deltaLabel = Math.abs(delta) < 0.5 ? "Flat vs. prior cycle" : (delta > 0 ? "▲ " : "▼ ") + Math.abs(delta).toFixed(1) + " pts vs. prior cycle";
                return `
                    <div class="panel">
                        <div class="section-title" style="margin-top:0;">${t}</div>
                        <div class="panel-caption" style="margin-top:-4px;">Waived / Total members</div>
                        <div class="waiver-row"><span class="cycle">2026</span><span>${prior.waivedCount} / ${prior.memberCount} <span class="pct">(${priorPct.toFixed(1)}%)</span></span></div>
                        <div class="waiver-row"><span class="cycle">2027</span><span>${current.waivedCount} / ${current.memberCount} <span class="pct">(${currentPct.toFixed(1)}%)</span></span></div>
                        <div class="trend-delta ${deltaCls}">${deltaLabel}</div>
                    </div>`;
            }).join("");
        }
    }

    customElements.define("com-porticobenefits-memberoperations", MemberOperations);
})();
