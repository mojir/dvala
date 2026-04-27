# Relicensing Strategy

**Status:** Draft
**Created:** 2026-04-26

## Goal

Move Dvala from MIT to a license model that preserves commercial / acquisition optionality without alienating early adopters, and lock down the IP chain so a future acquirer's due diligence is a non-event.

The endgame is *optionality*, not a specific license. We want to be able to:
- Keep building openly today
- Switch to source-available / dual-licensed if/when traction warrants it
- Sell the project (asset sale or acqui-hire) without IP friction

---

## Background

### Current state

- **License:** MIT continuously since 2021, originally as **Lits**, renamed to **Dvala**. Same `LICENSE` file, same copyright holder. Public on GitHub the entire time.
- **Copyright holder:** Albert Mojir (sole)
- **Contributors:** Effectively solo. `git shortlog`:
  - Albert Mojir — 1910 commits across three email identities
  - Robin Wallberg — 3 commits (`.gitignore`, reserved-words list, one-char `package.json` change). All almost certainly de minimis.
- **Trademark:** "Dvala" is **not** registered.
- **CLA:** None in place.
- **External users:** Limited; no large public adoption that would coordinate a hostile fork.
- **Continuous public-MIT history.** This is a genuinely strong asset for due diligence: a 5+ year audit trail of public MIT publication under Albert's name. Hard for any later party (including past employers) to plausibly claim surprise ownership.

This is an unusually clean IP situation. Almost any path stays open.

### Why MIT is suboptimal for an exit

Permissive licenses (MIT/Apache) make the *code* a commodity. In an acquisition, buyers pay for things that are *not* commoditized:

1. **The team** (acqui-hire)
2. **The trademark + brand**
3. **Customer / user relationships**
4. **The IP — but only if it's defensible** (proprietary, copyleft, or source-available)

Under MIT, a buyer can fork the repo and walk away. The code itself contributes ~zero to deal value.

### Why not just go proprietary today

- Kills the open-source narrative that's driving early adoption
- Closes off contributor pipeline
- A premature switch with no traction signals desperation, not strategy

### The middle path

Source-available (BSL, Elastic License v2) and dual-licensing (AGPL + commercial) preserve community while making the IP defensible. Relicensing is well-precedented:

| Project    | Original    | Relicensed to | Outcome                          |
|------------|-------------|---------------|----------------------------------|
| HashiCorp  | MPL         | BSL (2023)    | Acquired by IBM, $6.4B (2024)    |
| MongoDB    | AGPL        | SSPL (2018)   | Public, ~$30B mcap               |
| Redis      | BSD         | RSALv2/SSPL   | Sold parts, kept momentum        |
| Elastic    | Apache 2.0  | SSPL/Elastic  | Public                           |
| Sentry     | BSD         | BSL (2019)    | Profitable, growing              |
| CockroachDB| Apache 2.0  | BSL (2019)    | Continued growth                 |
| Terraform  | MPL         | BSL (2023)    | OpenTofu fork — cautionary tale  |

Terraform is the cautionary tale: a *huge* user base felt betrayed and forked. The lesson is *when* and *how* you relicense matters as much as *what* you pick.

---

## Proposal

A staged plan: **lock down the IP chain now, defer the license switch until there's a strategic reason.** The license change itself is the cheap, last step. The expensive part is making sure you *can* change it cleanly when the time comes.

### Stage 1 — IP hygiene (do now, ~1 week of calendar time)

Goal: every line of Dvala is unambiguously relicensable by Albert alone.

1. **Get Robin's blessing in writing.**
   One email, archived. Sample text:
   > "Hi Robin — quick paperwork thing. I'm planning to keep Dvala's licensing options open, including possibly relicensing in the future. You contributed 3 small commits back in [year]. Can you confirm you're OK with your contributions being relicensed under any future license I choose? A 'yes' in this thread is all I need."
   Belt-and-braces fallback: if he doesn't respond, the contributions are de minimis (`.gitignore` entries, a 1-char config change, list additions) — likely uncopyrightable, and MIT already grants sublicensing rights regardless. But the email is free insurance.

2. **Add a CLA.**
   Use [CLA Assistant](https://cla-assistant.io/) — free, GitHub-integrated, signs via PR comment. Two doc options:
   - **Apache ICLA** (industry standard, broad): contributor grants Albert a perpetual license + can't sue for patents
   - **DCO** (Developer Certificate of Origin, sign-off only): lighter-weight, used by Linux. Doesn't grant relicense rights — *not enough for our goal*. Skip.

   Recommendation: Apache ICLA via CLA Assistant. Triggered automatically on first PR; non-blocking for trivial / docs PRs via bot config.

3. **Consolidate copyright headers.**
   Audit `src/` for any per-file copyright headers. Standardize on one-line: `// Copyright (c) 2021–2026 Albert Mojir. Licensed under MIT — see LICENSE.` Or omit entirely (the LICENSE file is sufficient under MIT). Goal: no surprise third-party headers.

4. **Document third-party code.**
   Run `npx license-checker --production --summary` (or equivalent) to inventory dependencies. Flag any GPL/AGPL transitive deps — they can poison a relicense. Most likely we're fine (TypeScript ecosystem skews MIT/Apache/ISC), but we should know.

5. **Register the "Dvala" trademark.**
   This is independent of the code license and arguably more strategically important.
   - **Class 9** (software) and **Class 42** (SaaS / dev tools) in your home jurisdiction (Sweden / EU via EUIPO).
   - EUIPO filing is straightforward and cheap (~€850 for one class, ~€1000 for two). DIY-able with a weekend of reading.
   - Adds "TM" usage now → "®" once registered.
   - **Why this matters:** in any acquisition, the trademark is what the buyer is *actually* buying — you can't fork a brand. A MIT codebase + registered trademark + Albert-the-creator is a coherent acqui-hire package even without a relicense.

### Stage 2 — Choose the target model (decide now, switch later)

Pick the destination license *now* so all Stage-1 paperwork (CLA, etc.) is shaped to support it. Three credible candidates:

#### Option A: BSL 1.1 (Business Source License) — recommended

- Source visible on GitHub, full read access
- Free for non-production use
- Free for production use **except** for parties offering Dvala-as-a-service competing with us
- Auto-converts to Apache 2.0 after N years (typically 4) — keeps the OSS soul intact
- Used by HashiCorp, CockroachDB, Sentry, MariaDB

**Pros:** broad community acceptance ("delayed open source"), strong commercial defensibility, preserves DX for individual users.
**Cons:** OSI doesn't recognize it as "open source" → some users / employers can't use it.

#### Option B: AGPL-3.0 + commercial dual-license

- AGPL is OSI-approved, "real" open source
- AGPL's network-copyleft means anyone using Dvala in a SaaS must open-source their entire app — strong incentive for companies to buy a commercial license
- Used by MongoDB (pre-SSPL), GitLab, Grafana

**Pros:** OSI-compliant, classic dual-license play.
**Cons:** AGPL scares some companies away from *all* uses (overcautious legal teams). Less compatible with embedding Dvala in user-facing tools.

#### Option C: Stay MIT + sell trademark + team

- No relicense at all. The acquisition is purely an acqui-hire + brand transfer.
- Code stays MIT forever; buyer gets Albert + the "Dvala" trademark + the customer list.

**Pros:** zero community friction, no relicense controversy.
**Cons:** Lower exit value (code itself adds nothing to enterprise value); only viable if Albert + brand are genuinely the asset.

**Recommendation: BSL 1.1** as the staged target. It's the most direct path to "MIT now, defensible later." If activist users push back, the auto-Apache conversion clause is a strong response: *"the code becomes Apache 2.0 in 4 years — we just need a runway to monetize."*

### Stage 3 — Trigger conditions for the actual switch

Don't relicense until at least one of these holds:

- **Traction signal:** ≥ 500 GitHub stars, or known production use at a >50-employee company, or paying customers
- **Fundraise:** investors typically prefer source-available for defensibility
- **Acquirer interest:** a real conversation with a real buyer
- **Competitive forking risk:** someone else builds a commercial product on top of MIT Dvala

Until then, MIT is doing fine. The Stage-1 work is what preserves the option.

### Stage 4 — The relicense itself (when triggered)

When Stage 3 fires:

1. **Pre-announce by 30+ days** in a clear blog post. Explain *why*. The HashiCorp/Terraform fork happened partly because the announcement felt sudden and hostile.
2. **Cut a final MIT release** (`v1.0-final-mit` tag). Existing users can pin to it forever. Removes the "you took it away from us" narrative.
3. **Update the LICENSE file** on `main` going forward.
4. **Bump major version** (e.g., 2.0). Signal the break.
5. **Preserve old copyright notices** for any sublicensed code (e.g., Robin's contributions if not rewritten).
6. **Update README, docs, package metadata, npm `license` field.**
7. **Communicate**: blog post, README banner, in-CLI notice for one minor version, Discord/X post.

### Stage 5 — Pre-acquisition due diligence prep

When a buyer materializes:

- **Clean repo:** no committed secrets, no committed third-party code without notice
- **Dependency SBOM:** `npm sbom` output, current
- **Contribution log:** CLA-signed contributors list, plus the Robin email
- **Trademark certificate:** registered, current
- **Domain ownership:** whoever owns `dvala.dev` / GitHub org should be the same legal entity as the seller (probably a holdco at this point — see Open Questions)
- **No co-mingled IP:** Dvala code shouldn't accidentally include code from Albert's day-job employer. Audit that the work was truly off-hours / personal time. Sweden's employment IP rules differ from US — worth checking the employment contract.

---

## Open Questions

- **Holdco?** Should "Dvala" sit in a separate legal entity (e.g., a Swedish AB) before the relicense, to make the eventual asset sale cleaner? This is the kind of question only a Swedish startup lawyer can answer well — the structure affects taxation on exit (3:12-rules, qualified shares, etc.) and is worth thousands of euros to get right.
- **Employer-IP chain (very low risk, but worth one email).** The corporate chain is:
  - **YouCruit AB** — original employer; **no longer exists** (dissolved/restructured)
  - **Lanefinder AB** — Swedish successor; held the IP for a period
  - **Lanefinder LLC** (USA) — current IP holder, all rights migrated here

  Each transfer is a discrete asset-purchase event. Asset transfers move only the assets *specifically listed* in the agreement. If Dvala/Lits was never on YouCruit's books as company IP (consistent with its public MIT publication under Albert's personal copyright since 2021), it would not have been on any of the subsequent asset lists. Lanefinder LLC's claim chain therefore fails at step zero.

  Add to that:
  - 5+ year continuous public MIT history under Albert's name as copyright holder
  - Original employer doesn't exist to make a claim
  - Two successor transfers across jurisdictions (Sweden → USA) — chain-of-title friction works *against* any successor claim
  - Public, contemporaneous evidence of YouCruit/Lanefinder *consuming* Dvala as an external dependency, not owning it

  This is about as clean as a "did your old employer give you permission" story can be. Mitigation is a single confirmation email to **Lanefinder LLC** (the current IP successor), not the defunct YouCruit. Sample text: *"Confirming that Lanefinder LLC, as successor to YouCruit AB and Lanefinder AB, makes no claim to the Dvala/Lits codebase, which has been continuously published under Albert Mojir's personal copyright and an MIT license since 2021."* If Albert is still connected to anyone at Lanefinder, this is a 5-minute task.

- **Robin's status.** Was he a colleague at YouCruit? Same defunct-employer / successor logic applies; covered by the same Lanefinder LLC acknowledgment if framed broadly.
- **Patent strategy.** Dvala has genuinely novel ideas (the trampoline-based effect handler model, parallel-snapshot composition). Worth a defensive patent? Probably no — software patents are a tarpit, and an open-source-aligned project filing patents looks bad. But worth a 30-min conversation with a patent attorney to confirm.
- **Which BSL "Additional Use Grant"?** BSL has a configurable clause defining what production use is allowed. CockroachDB allows everything except competing DBaaS. We'd need to define what "competing with Dvala" means precisely — embeddable runtime? language? toolchain? Worth drafting now so the eventual switch is mechanical.
- **Who pays for the lawyer?** The plan above is 90% DIY-able, but there are 2-3 hours of actual legal work that should be paid for: trademark filing review, employment-IP confirmation, BSL Additional Use Grant drafting. Budget €2-5k for this. Cheap compared to the cost of getting it wrong.
- **Timeline pressure.** Is there a specific exit timeline (1 year? 5 years?), or is this purely opportunistic? Affects how aggressively we do Stage 1.

---

## Implementation Plan

### Phase 1 — IP hygiene (this month)

1. Email Robin Wallberg, request relicense consent, archive reply.
2. Audit `src/` for stray copyright headers; standardize.
3. Run `npx license-checker --production --summary`; document in `THIRD_PARTY.md` or similar; flag any GPL/AGPL transitive deps.
4. Optional (cheap insurance): email **Lanefinder LLC** (current successor to YouCruit / Lanefinder AB) requesting a one-line acknowledgment that they make no claim to the Dvala/Lits codebase. The corporate chain (YouCruit → Lanefinder AB → Lanefinder LLC) plus continuous public-MIT history since 2021 already makes this very low risk, but a written ack closes it forever.
5. Set up CLA Assistant on the GitHub repo with Apache ICLA.
6. Add a `CONTRIBUTING.md` documenting the CLA requirement.

### Phase 2 — Trademark & entity (next 1–3 months)

7. File "Dvala" trademark with EUIPO, classes 9 + 42. Cost ~€1000, ~6 month registration timeline.
8. Talk to a Swedish startup accountant about whether to form a holdco (AB) for Dvala. Probably defer until there's revenue or fundraise pressure, but ask the question.

### Phase 3 — Pre-position the license switch (next 3–6 months)

9. Decide and document the target license (recommendation: BSL 1.1).
10. Draft the BSL "Additional Use Grant" clause with a lawyer. Park it in `design/active/` until needed.
11. Draft the relicense announcement blog post. Park unpublished.

### Phase 4 — Trigger-driven (when Stage 3 conditions hit)

12. Tag the final MIT release.
13. Publish announcement, switch LICENSE on `main`, bump major version.
14. Update package metadata, README, docs.
15. Monitor community response; respond to fork attempts with clear communication, not legal threats.

### Phase 5 — Pre-acquisition (when a real buyer appears)

16. Generate fresh SBOM, dependency report, CLA contributor list.
17. Confirm trademark registration is current.
18. Engage a transactional lawyer for diligence support.
19. Negotiate.
