# Reference UI alignment

The supplied nine-screen reference uses a dark welcome screen and white/purple mobile surfaces. The existing app used green tokens, large page headings, and a single vertically stacked analysis. This change aligns the delivery layer with the reference while preserving the existing domain/API contracts.

## Screens

| Reference | Implementation |
| --- | --- |
| Welcome | Dark surface, vector lens mark, purple start button and login link. Both enter the existing email OTP flow. |
| Camera | Black header/controls, corner guides, shutter, JPEG gallery selection and torch. Permission, preview, retake and upload recovery are retained. |
| Person summary | Avatar fallback, identity, icon shortcuts, brief, chips, connection summary, analysis action. |
| Analysis preparation | Approved personal context grouped into skills, interests, offer and seeking; meeting goal selected before upload. |
| GIVE / GET | Dedicated tab with green/blue rows and visible fact/hypothesis labels. |
| BRIDGE | Separate tab with paragraph cards and the user's existing interest themes. |
| Conversation | Numbered questions, conversation tip and a route to record notes. |
| Note | Note field, explicit next-action checkbox, editable action/timing, save controls. Partial save failures retain input and avoid resaving a successful note in the same visit. |
| Home | Actual scan history, name/company/title search, status filters, cards, confirmed deletion and bottom navigation. |

## Data-dependent differences

The reference is not fully represented by the current contracts. No fake scores, people, news or workflow state are introduced into production:

- There is no portrait or romanized-name field. The UI uses a neutral avatar and actual card fields.
- There is no relationship-score calculation. The existing `potential` text is displayed instead of a fabricated percentage.
- There are no follow-up, sales-pipeline or agreement statuses. Filters use real analysis states.
- There is no news/timeline or generated keyword endpoint. The summary shows known company/role chips and `why_you`.
- The API suggests one next action; the note screen uses that action rather than inventing three. Timing is saved as text; notification scheduling is not implemented.
- Meeting goal is sent when a scan is created. The post-scan preparation screen displays the stored choice; changing it/re-running analysis would need backend support. Editing approved context remains available, but does not regenerate an already completed analysis.
- The vector lens mark approximates the supplied reference; no original logo/portrait asset was provided. OS status/home bars are supplied by the device.

## Structure and behavior

New screen modules live under `apps/mobile/components`; `ui.tsx` supplies frames, buttons, chips, avatar fallback and navigation. Colors live in `packages/ui-tokens`. The orchestration stays in `personal-context-app.tsx`; `lib/scan-navigation.ts` prevents background completion from dismissing a user-selected screen and routes failures to recovery.

The preview at `/ui-preview` uses synthetic, non-PII fixtures and real UI components. It is available only with both `__DEV__` and `EXPO_PUBLIC_ENABLE_UI_PREVIEW=1`. It has no backend writes. Add `?screen=summary`, `welcome`, `camera`, `preparation`, `give-get`, `bridge`, `conversation`, `note`, or `home` for individual screens.

PowerShell preview:

```powershell
$env:EXPO_PUBLIC_ENABLE_UI_PREVIEW='1'
pnpm --filter @miraio/mobile web --port 8097
```

## Validation

- `pnpm install --frozen-lockfile` before implementation.
- Expo-compatible `expo-linear-gradient`, `react-native-svg`, `expo-image-picker` added with lockfile updates.
- `pnpm check`: lint, TypeScript, tests and both app builds passed. 276 tests passed; one pre-existing database integration test was skipped.
- Browser: nine screens rendered at 375 × 812; summary → preparation → analysis tabs → note → home exercised with synthetic callbacks. Search, search clearing and analysis-state filtering verified. 812 × 375 layout checked for horizontal overflow.
- Fixed pre-existing validation blockers: scan-delete route import depth, missing identity status in an API fixture, and unused intentional no-op/omitted variables. No database or AI schema changes.
- Native camera/photo permissions, authenticated end-to-end persistence and Supabase integration remain device/environment acceptance checks. Browser fixture saves verify UI callbacks only.

## Changed files

Mobile: `app.json`, `package.json`, `app/ui-preview.tsx`; components `analysis-preparation-screen.tsx`, `camera-frame.tsx`, `card-scan-screens.tsx`, `home-screen.tsx`, `icons.tsx`, `personal-context-app.tsx`, `personal-context-screens.tsx`, `relationship-screens.tsx`, `ui.tsx`, `welcome-screen.tsx`; libraries `analytics.ts`, `scan-image-file.ts`, `scan-navigation.ts`, `scan-navigation.test.ts`.

Shared/validation: `packages/ui-tokens/src/index.ts`, `packages/domain/src/flash-brief/flash-brief.test.ts`, `apps/api/app/v1/scans/[scanId]/route.ts`, `apps/api/lib/flash-brief.test.ts`, `pnpm-lock.yaml`, and this report.
