# Field validation tasks

## Before 3 November 2026

- [ ] **1. Pilot protocol and scorecard (S).** Define eligible encounter, consent wording, manual tally, and 24-hour/7-day/30-day check forms without card PII. Verify that each metric in `tasks/plan.md` has a denominator and owner. Depends on: none.
- [ ] **2. Actual-phone smoke test (M).** Run sign-in, synthetic card scan, Brief, note, Next Action, reminder, and analytics on the intended device and event network. Record latency and recovery steps. Depends on: 1. Verification: complete one end-to-end run; `pnpm check` for any code changes.
- [ ] **3. Repair only rehearsal blockers (S/M per defect).** Open a separate scoped implementation ticket for each confirmed blocker; preserve the MVP product spec. Depends on: 2. Verification: reproduce failure, fix, and rerun device smoke test and `pnpm check`.

### Checkpoint: field readiness

- [ ] Takahashi can complete the flow on the actual phone, privacy/consent wording is ready, and a manual tally is available if analytics fails.

## 3 November and follow-up

- [ ] **4. One-event field rehearsal.** Tally eligible exchanges, feasible scans, Brief use, question adoption, note/action capture, and incidents. Depends on: field readiness. Verification: reconcile anonymous counts with app analytics without copying PII into the repository.
- [ ] **5. 24-hour and 7-day review.** Record manually performed follow-ups, next meetings, and the top three points of friction. Depends on: 4. Verification: each outcome has a clear source and missing data is marked unknown.
- [ ] **6. 30-day review and decision.** Record later progression; decide whether to run the B2B exhibitor trial, fix the flow, or reassess the wedge. Depends on: 5. Verification: decision cites observed evidence and sample limits.

## Approved pilot extensions (ML-028)

- [ ] **7. Event review slice.** Validate event creation, selective scan attachment, and owner-only review on the actual phone and backend. Verification: local DB tests and device walkthrough.
- [ ] **8. Follow-up triage slice (M, only if observed need).** Define priority/second-follow-up tracking without auto-sending. Depends on: 5. Verification: user can mark and review follow-through; `pnpm check`.
- [ ] **9. Audio memo.** Verify microphone permission, explicit consent, recording/playback/delete, and retention on Android and iOS. No paid transcription call.
- [ ] **10. HubSpot handoff.** Test OAuth and contact/note export against a configured test portal after credentials are provided. Until then, use fake-provider contract tests only.
- [ ] **11. Event team read.** Validate owner invite/revoke and the restricted shared projection with two synthetic accounts. Verify no image, Personal Context, or private AI output leaks.

### Checkpoint: exhibitor trial decision

- [ ] The team can explain who uses, who pays, what changed in an encounter, and what the next paid experiment tests.
