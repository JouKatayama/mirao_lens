# Miraio Lens MVP v0.1 Product Specification

**Document status:** Draft for implementation / Codex-ready baseline  
**Version:** 0.1  
**Date:** 2026-08-17  
**Product:** Miraio Lens  
**Category:** First-Meeting Relationship Intelligence  
**Development model:** Human Product Owner × GPT PM/Scrum Master/Tech Lead × Codex Implementation Agent

---

## 0. Executive Summary

### 0.1 Product definition

Miraio Lens is not a digital business-card replacement and not a generic contact manager.

It uses a physical business card as the trigger for understanding a newly met person, then combines:

1. business-card facts,
2. public person/company/role context,
3. the user's Personal Context,
4. the meeting goal / situation,

to generate, within seconds:

- **WHO** — who this person is in a business context,
- **WHY YOU** — why this person matters to the user,
- **SAY THIS** — what to talk about now,
- **POTENTIAL** — the potential value of the relationship,
- **GIVE / GET / BRIDGE / ASK / NEXT** — mutual value and next action.

> **「相手について詳しくする」のではなく、「自分と相手の間にある可能性を見つける」。**

### 0.2 MVP thesis

> **Can Miraio Lens make the first few minutes of a business meeting measurably better by showing useful, grounded, personalized conversation guidance immediately after a business-card scan?**

### 0.3 MVP flow

```text
Personal Context Setup
        ↓
Business Card Scan
        ↓
Card / Company / Role Context
        ×
My Personal Context
        ×
Meeting Goal
        ↓
5-second-class Flash Brief
        ↓
Mutual Value
        ↓
Conversation Note
        ↓
Next Action
```

---

# 1. DISCOVER — Product Hypothesis

## 1.1 Vision

**名刺管理ではなく、初対面の可能性を最大化する。**

Long term, Miraio Lens becomes the first vertical product of a broader Human Opportunity / Relationship Intelligence platform. MVP v0.1 must prove the first-meeting wedge.

## 1.2 Problem

- Business cards tell users **who**, but not **why this person matters to me**.
- Public web information may describe the person/company, but not the relationship between the person and the user.
- The useful window is often the first few minutes.
- Generic AI can confuse fact and inference.
- Same-name people or people with little online presence create identification risk.
- Contacts are often stored without the relationship progressing.

## 1.3 Target user

Primary persona: a business professional who meets multiple new people in real-world settings and where new relationships can lead to business value.

Examples: consultant, salesperson, business development, recruiter, entrepreneur/executive, community organizer, professional event attendee.

Initial contexts:
1. business networking event,
2. conference / exhibition,
3. customer or partner introduction,
4. recruiting / career event,
5. professional community gathering.

## 1.4 Jobs To Be Done

### Primary

> **When I receive a business card from someone I have just met, I want to understand the most relevant connection between that person and me within seconds, so that I can start a meaningful business conversation instead of defaulting to small talk.**

### Secondary

> After the conversation, I want to remember what mattered and what to do next, so that a good encounter does not disappear into a pile of business cards.

## 1.5 Riskiest assumptions

| ID | Assumption | Why it matters |
|---|---|---|
| H1 | Looking at a phone immediately after card exchange is socially acceptable | If not, the real-time UX fails |
| H2 | A useful result can be produced fast enough | Value disappears if the user waits |
| H3 | “自分との接点” is more valuable than generic person summary | Core differentiation |
| H4 | AI conversation guidance changes real behavior | Otherwise it is novelty only |
| H5 | Company/role context is sufficient when personal web data is unavailable | Needed for coverage |
| H6 | Users will store Personal Context if value is clear | Required for personalization |
| H7 | Fact/Hypothesis/Ask separation increases trust | Required to reduce hallucination risk |

## 1.6 Pilot success hypothesis

Validation thresholds, not contractual SLAs:

- ≥ 100 real card scans
- ≥ 20 pilot users
- ≥ 60% of Flash Briefs rated **4/5 or higher**
- ≥ 30% Conversation Adoption Rate
- ≥ 40% of scans lead to Mutual Value view
- ≥ 20% of meaningful scans create a Next Action
- **0 known high-severity wrong-person identifications presented as fact**
- P50 Flash Brief target ≤ 5s
- P90 Flash Brief target ≤ 10s

---

# 2. DEFINE — Scope

## 2.1 IN

1. authentication,
2. Personal Context onboarding,
3. business-card camera capture,
4. card field extraction,
5. company / role / public context enrichment,
6. basic identity confidence,
7. Fast Path Flash Brief,
8. Mutual Value detail,
9. Fact / Hypothesis / Ask labeling,
10. evidence/source tracking,
11. conversation note,
12. suggested Next Action,
13. scan history,
14. delete flow,
15. analytics and AI evaluation logging.

## 2.2 OUT

- digital business-card creation,
- NFC card issuance,
- full CRM,
- Salesforce / HubSpot integration,
- Gmail / Calendar integration,
- authenticated LinkedIn scraping,
- contacts sync,
- organization/team accounts,
- Relationship Graph visualization,
- automated introductions,
- event attendee matching,
- realtime voice transcription,
- smart-glasses experience,
- full sales pipeline,
- Career / Teams / Alliance products,
- automatic outreach/send-email,
- billing.

---

# 3. DEFINE — User Stories & Acceptance Criteria

## US-001 — Personal Context onboarding

**As a user**, I want Miraio Lens to understand my professional context.

Acceptance:
- Enter current role/company, past experience, expertise, strong skills, current themes, what I can offer, what I want to learn/find, optional free text.
- AI suggests structured Personal Context.
- User approves before use.
- User can edit/delete items.
- Personal Context is private.

## US-002 — Scan business card

**As a user**, I want to photograph a business card with minimal interaction.

Acceptance:
- Camera permission requested only when needed.
- Card frame guide.
- Capture/retry.
- Front-side card sufficient.
- Image uploaded privately and temporarily.
- `scan_id` created immediately.
- Processing begins without waiting for enrichment.

## US-003 — Extract card facts

Required nullable fields:
- name,
- company,
- department,
- title,
- email,
- phone,
- website,
- address.

Acceptance:
- Schema-valid output.
- Extraction kept separate from inference.
- Card-derived claims labeled `FACT`.
- User can correct fields.

## US-004 — Flash Brief

Required output:

```text
WHO
WHY YOU
SAY THIS
POTENTIAL
```

Acceptance:
- Uses card facts, available company/role context, Personal Context, meeting goal.
- Does not block on deep enrichment.
- Low-data fallback works.
- `SAY THIS` is a natural business question, not a scripted pitch.
- Potential is explicitly heuristic.
- Uncertain statements are hypotheses.

## US-005 — Mutual Value

Required:
- `GIVE`
- `GET`
- `BRIDGE`
- `ASK`
- `NEXT`

Acceptance:
- Personalized to user context.
- Prefer complementarity, not superficial similarity.
- Separate facts from hypotheses.
- No sensitive-trait inference.

## US-006 — Same-name / low-data handling

Acceptance:
- Identity status: `verified | high_confidence | medium_confidence | unresolved`.
- If unresolved, no person-specific web biography is shown as fact.
- Fallback: company → department → role → industry.
- Even with no public person data, generate WHY YOU / SAY THIS / ASK.

## US-007 — Conversation note / Next Action

Acceptance:
- User can save short text note.
- Note is private.
- AI suggests one Next Action.
- User can accept/edit/dismiss.
- No automatic message sending.

## US-008 — Delete scan

Acceptance:
Deleting a scan deletes or detaches:
- temporary raw image,
- card record,
- scan evidence,
- analysis,
- notes,
- next actions.

---

# 4. DESIGN — UX

## 4.1 Primary navigation

```text
Home / Scan
History
My Context
Settings
```

## 4.2 Core flow

```text
[Onboarding]
     ↓
[Home / Scan]
     ↓
[Card Capture]
     ↓
[Processing]
     ↓
[Flash Brief]
     ↓
[Mutual Value]
     ↓
[Conversation Note]
     ↓
[Next Action]
```

## 4.3 Onboarding

Target: usable Personal Context in under 3 minutes.

Prompts:
1. 今の仕事
2. 得意なこと
3. 最近取り組んでいること
4. 人に提供できること
5. 今知りたい / 会いたい人
6. AIに自分を説明するなら（自由入力）

## 4.4 Meeting goal

- Networking
- Sales
- Recruiting
- Partnership
- Learning / Information Exchange
- Other

Default: Networking.

## 4.5 Processing UI

```text
✓ 名刺を読み取りました
✓ 会社・役職を確認
● あなたとの接点を分析中
○ 会話候補を生成中
○ 公開情報を追加調査中
```

## 4.6 Flash Brief

**WHO**  
Name / company / title + one-line summary

**WHY YOU**  
Strongest reason this person is relevant to the user

**SAY THIS**  
One opener/question

**POTENTIAL**  
1–5 indicator + one-line rationale

Reading-time goal: ≤ 5 seconds.

CTA: **Win-Winを詳しく見る**

## 4.7 Mutual Value

- GIVE — あなたから相手に提供できそうな価値
- GET — 相手から得られそうな知見・機会
- BRIDGE — なぜこの二人は話す価値があるか
- ASK — 今確認するとよいこと
- NEXT — 次の一手

---

# 5. DESIGN — AI Pipeline

## 5.1 Principle

Do not implement:

```text
business card image → one giant prompt → final answer
```

Implement:

```text
1. Card Intelligence
        ↓
2. Target Context Builder
        ↓
3. Identity Resolution
        ↓
4. Personal Context Retrieval
        ↓
5. Relationship Reasoning
        ↓
6. Evidence / Uncertainty Validation
        ↓
7. Flash Brief Formatter
        ↓
8. Deep Mutual Value Enrichment
```

## 5.2 Fast Path

Inputs:
- card extraction,
- company/domain basics,
- title/department,
- top relevant Personal Context items,
- meeting goal.

Outputs:
- WHO,
- WHY YOU,
- SAY THIS,
- POTENTIAL.

## 5.3 Deep Path

Asynchronous:
- official company information,
- recent public business information,
- person candidate resolution,
- stronger evidence,
- richer Mutual Value,
- refined Next Action.

## 5.4 Personal Context retrieval

Do not send the full profile to every call.

```text
Target Context
    ↓
semantic retrieval
    ↓
Top 5–10 relevant Personal Context items
    ↓
Relationship Reasoning
```

Always include:
- current role,
- what I can offer.

## 5.5 Identity Resolution

Inputs:
- name,
- company,
- domain,
- department,
- title,
- email,
- address,
- public candidates.

Status:
- `verified`
- `high_confidence`
- `medium_confidence`
- `unresolved`

Hard rule: if medium/unresolved, do not present person-specific public-web claims as confirmed facts.

## 5.6 Graceful degradation

```text
Person data available
→ Person + Company + Role

Person data unavailable
→ Company + Department + Role

Company data limited
→ Industry + Role

Minimal data
→ Card Facts + Role Taxonomy + Meeting Goal
```

## 5.7 Fact / Hypothesis / Ask

Example:

```text
FACT
人事DX推進部 部長

HYPOTHESIS
人材データ統合や生成AI活用が現在のテーマである可能性

ASK
「今、人事DXで最も優先度が高いテーマは何ですか？」
```

## 5.8 AI safety

Do not infer/expose sensitive traits such as race, religion, health/disability, sexual orientation, political beliefs, family/private-life status.

Do not infer personality from face, name, card design, or appearance.

Do not generate manipulative/deceptive tactics.

---

# 6. Canonical Data Contracts

## 6.1 CardExtraction

```json
{
  "name": null,
  "company": null,
  "department": null,
  "title": null,
  "email": null,
  "phone": null,
  "website": null,
  "address": null,
  "language": "ja",
  "field_confidence": {
    "name": 0.0,
    "company": 0.0,
    "title": 0.0
  }
}
```

## 6.2 FlashBrief

```json
{
  "who": {
    "headline": "string",
    "summary": "string"
  },
  "why_you": {
    "text": "string",
    "claim_type": "fact|hypothesis"
  },
  "say_this": {
    "question": "string",
    "reason": "string"
  },
  "potential": {
    "score": 1,
    "reason": "string"
  },
  "identity_status": "verified|high_confidence|medium_confidence|unresolved",
  "generated_at": "ISO-8601"
}
```

`potential.score` is integer 1–5 and is an explainable product heuristic, not an objective compatibility score.

## 6.3 MutualValue

```json
{
  "give": [
    {
      "text": "string",
      "claim_type": "fact|hypothesis",
      "evidence_ids": []
    }
  ],
  "get": [],
  "bridge": [],
  "ask": [
    {
      "question": "string",
      "validates_hypothesis": "string|null"
    }
  ],
  "next_action": {
    "action": "string",
    "timing": "string|null",
    "reason": "string"
  }
}
```

## 6.4 Evidence

```json
{
  "id": "uuid",
  "source_type": "business_card|user_correction|official_company|public_web|user_context|ai_inference",
  "source_title": "string|null",
  "source_url": "string|null",
  "retrieved_at": "ISO-8601|null",
  "content_excerpt": "string|null",
  "confidence": 0.0
}
```

---

# 7. System Architecture

## 7.1 Principle

**Modular monolith + asynchronous AI pipeline.**

No microservices for MVP.

```text
┌──────────────────────────────┐
│ React Native / Expo Mobile   │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│ API / BFF (TypeScript)       │
│ Auth / Scan / Analysis       │
└──────┬─────────────┬─────────┘
       │             │
       │ sync        │ async
       ▼             ▼
 Fast Path       Background Jobs
       │             │
       └──────┬──────┘
              ▼
┌──────────────────────────────┐
│ AI Orchestration Modules     │
│ Card / Identity / Research   │
│ Context / Relationship       │
│ Evidence / Formatter         │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Supabase                     │
│ PostgreSQL / Auth / Storage  │
│ pgvector                     │
└──────────────────────────────┘
```

## 7.2 Recommended stack

### Mobile
- React Native
- Expo
- TypeScript
- Expo Camera

### Backend
- TypeScript
- Next.js Route Handlers / BFF-style API
- Vercel or equivalent

### Data
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- pgvector

### Background processing
- Inngest-style event/background jobs

### AI
- provider abstraction
- initial implementation with an API model supporting image input, structured output, reasoning and web search/tool use where required.

Model IDs are configuration, not domain logic.

---

# 8. Monorepo Structure

```text
miraio-lens/
├─ apps/
│  ├─ mobile/
│  └─ api/
├─ packages/
│  ├─ domain/
│  │  ├─ card/
│  │  ├─ identity/
│  │  ├─ context/
│  │  ├─ relationship/
│  │  ├─ evidence/
│  │  └─ next-action/
│  ├─ ai/
│  │  ├─ providers/
│  │  ├─ prompts/
│  │  ├─ schemas/
│  │  └─ evaluators/
│  ├─ db/
│  ├─ shared/
│  ├─ ui-tokens/
│  └─ test-fixtures/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ evals/
│  ├─ golden-dataset/
│  └─ scoring/
├─ docs/
│  ├─ product/
│  ├─ architecture/
│  └─ adr/
└─ README.md
```

---

# 9. Data Model

Main tables:

### `profiles`
- id, user_id, display_name, current_company, current_role, timestamps

### `personal_context_items`
- id, user_id, type, text, tags, embedding, source_type, user_approved, created_at

### `scans`
- id, user_id, status, meeting_goal, raw_image_path, raw_image_expires_at, timestamps

### `business_cards`
- id, scan_id, user_id, card fields, extraction_json, user_corrected, created_at

### `people`
For v0.1: user-scoped.
- id, owner_user_id, name, title, department, identity_status, created_at

### `organizations`
For v0.1: user-scoped.
- id, owner_user_id, name, domain, industry, summary, created_at

### `evidence`
- id, user_id, scan_id, source_type, source_title, source_url, retrieved_at, excerpt, confidence

### `relationship_analyses`
- id, user_id, scan_id, flash_brief_json, mutual_value_json, model_metadata_json, generated_at

### `interaction_notes`
- id, user_id, scan_id, note_text, created_at

### `next_actions`
- id, user_id, scan_id, action_text, timing_text, status, source, created_at

### `ai_runs`
- id, user_id, scan_id, stage, provider, model_alias, latency_ms, status, cost metadata, error_code, created_at

---

# 10. API Contract

### `POST /v1/context/onboarding`
Create structured context suggestions.

### `GET /v1/context`
Get approved Personal Context.

### `PATCH /v1/context/:itemId`
Edit/approve item.

### `DELETE /v1/context/:itemId`
Delete item.

### `POST /v1/scans`
Input: card image + meeting goal.

Output:
```json
{
  "scan_id": "uuid",
  "status": "extracting"
}
```

### `GET /v1/scans/:scanId/status`

### `GET /v1/scans/:scanId/brief`

### `GET /v1/scans/:scanId/mutual-value`

### `PATCH /v1/scans/:scanId/card`

### `POST /v1/scans/:scanId/note`

### `POST /v1/scans/:scanId/next-action`

### `DELETE /v1/scans/:scanId`

---

# 11. Processing State Machine

```text
created
  ↓
image_uploaded
  ↓
extracting_card
  ↓
card_ready
  ↓
fast_context
  ↓
generating_brief
  ↓
brief_ready
  ↓
deep_enrichment
  ↓
deep_ready
```

Failure:
- `failed_retryable`
- `failed_terminal`

The client must show a usable result even when deep enrichment fails.

---

# 12. Privacy & Security

## Raw card image
- private only,
- temporary by default,
- target auto-deletion within 1 hour after successful extraction,
- failed jobs also expire.

## Data isolation
All user-owned data is user-scoped and protected by database authorization/RLS where exposed.

## Secrets
Never expose AI, service-role or job-signing secrets to mobile.

## Logging
Do not log full emails, phones, raw OCR or Personal Context in standard logs.

## Public research
Only publicly accessible sources in v0.1. No authenticated scraping of closed networks.

## Deletion
Individual scan deletion required. Account-level full deletion required before broad external release.

---

# 13. Non-Functional Requirements

## Performance
- P50 Flash Brief ≤ 5s target
- P90 ≤ 10s target
- deep enrichment continues asynchronously
- progress UI always visible

## Reliability
- bounded retries,
- idempotent stages where possible,
- partial results preserved,
- no duplicate side effects.

## Accessibility
- readable mobile type,
- labels in addition to colors,
- permission-denial recovery.

## Localization
Japanese-first, but domain schemas language-neutral.

---

# 14. Analytics

Activation:
- `signup_completed`
- `personal_context_completed`
- `first_scan_started`
- `first_brief_viewed`

Scan funnel:
- `scan_capture`
- `scan_upload_success`
- `card_extraction_success`
- `brief_ready`
- `brief_viewed`
- `mutual_value_viewed`

Value:
- `say_this_used_yes/no`
- `brief_usefulness_rated`
- `conversation_note_saved`
- `next_action_created`
- `next_action_accepted`

Trust:
- `card_corrected`
- `identity_flagged_wrong`
- `hypothesis_marked_unhelpful`
- `source_opened`

### North Star for pilot
**Conversation Adoption Rate**

### Guardrail
**Wrong Identity Incident Rate**
Target: zero high-severity incidents.

---

# 15. Golden Dataset / Evaluation

At least 30 cases before heavy prompt tuning.

Required cases include:
- normal Japanese corporate card,
- same-name person,
- no SNS,
- no public person info,
- limited company info,
- large-company manager,
- startup executive,
- no title,
- no department,
- English card,
- mixed Japanese/English,
- low-quality/angled photo,
- multiple contact fields,
- sole proprietor,
- QR card,
- changed title,
- ambiguous company,
- parent/subsidiary confusion,
- wrong web candidate,
- highly/weakly relevant Personal Context,
- multiple meeting goals.

Each case contains:
```text
input image
Personal Context
meeting goal
expected extracted fields
allowed facts
forbidden assumptions
ideal WHY YOU
acceptable SAY THIS
expected identity status
human usefulness target
```

Score 1–5:
- extraction accuracy,
- grounding,
- personalization,
- business relevance,
- conversation usefulness,
- conciseness,
- uncertainty handling,
- safety.

---

# 16. PLAN — Backlog

## Sprint 1 / P0 Walking Skeleton

### ML-001 Repository bootstrap
- monorepo
- CI
- lint/test/build
- env template

### ML-002 Supabase foundation
- Auth
- migrations
- RLS
- dev seed

### ML-003 Personal Context onboarding
- form
- AI structure
- review/edit/approve
- persistence

### ML-004 Card camera
- permission
- capture/retry
- private upload
- scan record

### ML-005 Card Intelligence
- extraction schema
- confidence
- fixtures
- error handling

### ML-006 Relationship Fast Path
- WHO
- WHY YOU
- SAY THIS
- POTENTIAL
- structured output
- latency logging

### ML-007 Processing + Flash Brief UI
- progress states
- brief screen
- error/retry
- history

## Sprint 2 / P1 Core differentiation

### ML-008 Company / Role Context
### ML-009 Identity Resolution
### ML-010 Evidence Layer
### ML-011 Mutual Value Engine
### ML-012 Fact / Hypothesis / Ask UI

## Sprint 3 / P1 Validation

### ML-013 Conversation note + Next Action
### ML-014 Golden Dataset + Eval Harness
### ML-015 Analytics
### ML-016 Privacy / deletion
### ML-017 Pilot hardening

---

# 17. Sprint 1 Specification

## Goal

> **A user can register Personal Context, photograph a business card, and receive a personalized Flash Brief end-to-end.**

Includes:
- ML-001 to ML-007

Explicitly excludes:
- deep web person research,
- sophisticated identity resolution,
- evidence UI,
- Mutual Value detail,
- notes,
- integrations.

## Demo

1. Sign in.
2. Enter Personal Context.
3. Scan a known test card.
4. See extracted name/company/title.
5. See processing.
6. Receive WHO / WHY YOU / SAY THIS / POTENTIAL.
7. Open scan from history.
8. Verify latency / AI run metadata.

## Definition of Done

- Physical mobile-device flow works.
- No mocked Flash Brief in demo path.
- ≥ 10 card fixtures pass extraction tests.
- ≥ 10 fast-path cases manually reviewed.
- No secrets in client/repo.
- User data user-scoped.
- Error states recoverable.
- Latency telemetry exists.
- README contains setup/run/test instructions.

---

# 18. Pilot Release Gates

Functional:
- scan → brief end-to-end,
- editable Personal Context,
- low-data fallback,
- unresolved identity does not fabricate person profile,
- scan deletion.

Quality:
- golden dataset reviewed,
- no critical hallucination-class failures in release sample,
- no known cross-user exposure.

UX:
- brief readable at a glance,
- scan usable without instructions,
- FACT vs HYPOTHESIS understandable.

Operational:
- errors monitored,
- AI latency logged,
- cleanup jobs verified,
- API/provider costs measurable.

---

# 19. Decisions Locked for v0.1

1. Physical business cards stay.
2. The unit of value is the relationship, not the contact.
3. Personal Context is first-class.
4. Fast Brief precedes deep research.
5. Low-data is normal, not an error.
6. Fact / Hypothesis / Ask is mandatory.
7. No giant one-prompt architecture.
8. No microservices for MVP.
9. No automatic outbound actions.
10. No single-model dependency in domain code.
11. Raw card images are temporary.
12. Success is measured by conversation behavior, not cards stored.

---

# 20. Open Product Owner Decisions

### OQ-001 Pilot distribution
Recommendation: private pilot after Sprint 1.

### OQ-002 Meeting goal
Recommendation: default Networking, one-tap change.

### OQ-003 POTENTIAL display
Recommendation: test stars/score vs qualitative High/Medium/Low because numeric scores may be over-interpreted.

### OQ-004 Public enrichment
Recommendation: add only after Walking Skeleton is stable.

### OQ-005 Permanent card-image storage
Recommendation: no in v0.1.

---

# 21. Human / GPT / Codex Roles

## Human Product Owner
- vision,
- target user,
- priority,
- UX acceptance,
- pilot evaluation,
- Go / No-Go.

## GPT
- requirements,
- Product Spec,
- acceptance criteria,
- architecture,
- tickets,
- review,
- eval analysis,
- next sprint.

## Codex
- repository investigation,
- implementation,
- tests,
- builds,
- fixes,
- refactoring,
- implementation report.

Loop:
```text
Human priority
→ GPT ticket / AC
→ Codex implementation
→ GPT review
→ Codex fix
→ Human experience test
→ GPT learn / classify
→ Backlog update
```

Feedback classes:
- Bug
- UX
- Hypothesis
- Feature
- Noise

Priority:
```text
Impact × Confidence ÷ Effort
```

---

# 22. Final MVP Principle

Whenever a feature request appears, ask:

> **Does this make the first few minutes of a new business relationship materially better?**

If no, it is probably not v0.1.

The first proof of value is:

> **「このアプリがあったから、この人と話す内容が変わった。」**
