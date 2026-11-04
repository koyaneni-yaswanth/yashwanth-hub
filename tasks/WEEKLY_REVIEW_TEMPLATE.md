# WEEKLY REVIEW TEMPLATE (SUNDAY 45-MINUTE SYNC)
**Project:** Pawan Shakti 1.0  
**Rhythm:** Sundays 11:00 AM – 11:45 AM (Strict 45-Minute Cap)  
**Rule:** No mid-week synchronous meetings. Founder bandwidth is protected. All progress is audited asynchronously through daily commits.

---

## 1. Meeting Agenda & Timebox Structure

```
[00:00 - 00:15] TELEMETRY & TEST DATA AUDIT (15 Mins)
• Review 1 Hz power curves logged this week (Raw scatter + bin-averaged mean)
• Cumulative hours logged, peak electrical power, cut-in speed verified
• Any sensor calibration drifts or data dropouts

[00:15 - 00:30] POD A VS. POD B SCORECARD & FABRICATION BLOCKERS (15 Mins)
• Pod A: Magnetic gear runout, pole bonding, air gap, dyno torque
• Pod B: Archimedes blade print quality, planetary backlash, PTFE lubrication
• Materials & Frame: 3030 chassis progress, bearing plate machining
• Resolve physical tooling, 3D printer queue, or lab access blockers

[00:30 - 00:45] BUSINESS/GRANTS PIPELINE & NEXT 7 DAYS LOCK (15 Mins)
• Customer discovery calls completed (actual count only)
• Grant milestones / mentor update status
• Lock exact 2.5-hour micro-tasks for the upcoming week (Days X to X+7)
• Meeting Adjourns (11:45 AM sharp)
```

---

## 2. Weekly Executive Summary Format (Fillable Template)

### Week Number: Week ___ (Days ___ to ___)  
**Date:** YYYY-MM-DD  
**Chair:** Founder (Yashwanth)  
**Attendees:** MME Junior, Pod A EE Juniors (2), Pod B EE Junior, Backbone EE Juniors (2)  
**Academic Mentor Memo Dispatched:** [YES / NO / N/A]

---

### Section 1: Telemetry & Empirical Data Progress
- **Total Test Runs Executed This Week:** _____ runs
- **Cumulative Active Test Hours Logged:** _____ hours
- **Maximum Continuous Power Recorded:** _____ W at _____ RPM (Load: _____ $\Omega$)
- **Lowest Sustained Cut-in Wind Speed:** _____ m/s
- **Total Energy Yield Accumulated:** _____ Wh
- **System Power Coefficient ($C_p$) at 8 m/s:** _____ (Betz Limit: 0.593)
- **Data Integrity & Gaps:** (Note any sensor errors, dropped packets, or calibration drifts)

---

### Section 2: Pod A vs. Pod B Drivetrain Scorecard (Days 1–45)
*Updated weekly based on empirical bench dyno and airflow measurements.*

| Metric | Target Boundary | Pod A: Magnetic + HAWT | Pod B: Archimedes + Planetary | Leading Pod This Week |
| :--- | :--- | :--- | :--- | :--- |
| **Cut-in Speed ($v_{\text{cut-in}}$)** | $\le 2.2\text{ m/s}$ | _____ m/s | _____ m/s | [Pod A / Pod B / Tied] |
| **Mechanical Efficiency ($\eta$)** | $\ge 85\%$ | _____ % | _____ % | [Pod A / Pod B / Tied] |
| **Starting Torque ($T_{\text{start}}$)** | $\le 0.05\text{ N}\cdot\text{m}$ | _____ N·m | _____ N·m | [Pod A / Pod B / Tied] |
| **Acoustic Noise (at 3m)** | $< 45\text{ dBA}$ | _____ dBA | _____ dBA | [Pod A / Pod B / Tied] |
| **Drivetrain Landed BOM** | $< ₹12,000$ | ₹ _____ | ₹ _____ | [Pod A / Pod B / Tied] |
| **Radial Runout / Backlash** | $\le 0.15\text{ mm}$ | _____ mm gap runout | _____ deg backlash | [Pod A / Pod B / Tied] |

**Key Drivetrain Findings & Decisions This Week:**
- *Pod A Status:*
- *Pod B Status:*

---

### Section 3: Safety & Hardware Integrity Audit
- [ ] Rotating parts safety shield inspected and intact?
- [ ] Dynamic E-stop brake verified under operational speed?
- [ ] Automated dump load engaged and tested at threshold?
- [ ] No loose fasteners (Loctite 243 applied and witness-marked)?
- [ ] Battery BMS operating with active over-voltage cutoff?
- **Safety Flags / Incidents:** (None / Describe)

---

### Section 4: Business, Beachhead Pilot & Grant Pipeline
- **Customer Outreach Messages Sent:** _____ (Target: 15)
- **Customer Discovery Calls Completed:** _____ (Target: 5)
- **Primary Pilot Site Candidates:**
  1. ________________________________________ (Interest: High / Med / Low)
  2. ________________________________________ (Interest: High / Med / Low)
- **Grant Progress (VNIT Venture Vault / ANRF / DST):**
  - Application Name: ________________________________________
  - Verified Deadline: YYYY-MM-DD
  - Utilization / Submission Status: ___________________________
- **Procurement Budget Spent to Date:** ₹ _______ / ₹ _______ (Ceiling)

---

### Section 5: Locked Micro-Tasks for the Next 7 Days (Days ___ to ___)
*Each task strictly adheres to the 2.5-hour atomic Definition of Done.*

- **MME Junior (Structural):**
  - Task: __________________________________________________
- **EE Junior 1 (Pod A):**
  - Task: __________________________________________________
- **EE Junior 2 (Pod A):**
  - Task: __________________________________________________
- **EE Junior 3 (Pod B):**
  - Task: __________________________________________________
- **EE Junior 4 (Power Backbone):**
  - Task: __________________________________________________
- **EE Junior 5 (Telemetry Backbone):**
  - Task: __________________________________________________
