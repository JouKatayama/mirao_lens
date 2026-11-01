import { z } from "zod";

import type { FlashBriefInput } from "../flash-brief/flash-brief";

// ─── Opportunity Playbook ────────────────────────────────────────────────────
//
// Generalized industry knowledge about what a role commonly deals with, and
// which question tends to open that topic. Every entry is a hypothesis: it says
// nothing about a particular person or company, and the brief must keep it
// that way (product spec 5.7). Selection is keyword overlap, not a model call,
// so the same card and profile always pick the same entries.

export const opportunityPlaybookThemeSchema = z.enum([
  "visual_inspection",
  "equipment_maintenance",
  "manufacturing_data",
  "production_planning",
  "equipment_software",
  "quality_assurance",
  "factory_dx",
]);

export type OpportunityPlaybookTheme = z.infer<
  typeof opportunityPlaybookThemeSchema
>;

const signalSchema = z.string().trim().min(1).max(40);

export const opportunityPlaybookEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/),
    industry: z.literal("manufacturing"),
    theme: opportunityPlaybookThemeSchema,
    target_departments: z.array(z.string().trim().min(1).max(40)).min(1),
    // Matched against the card and company context: who this entry is for.
    target_signals: z.array(signalSchema).min(1),
    // Matched against the user's own context: what they could offer.
    offering_signals: z.array(signalSchema).min(1),
    problem_hypothesis: z.string().trim().min(1).max(200),
    verification_dimensions: z.array(z.string().trim().min(1).max(60)).min(1),
    suggested_question: z.string().trim().min(1).max(200),
    potential_offerings: z.array(z.string().trim().min(1).max(60)).min(1),
    suggested_next_action: z.string().trim().min(1).max(200),
    fact_status: z.literal("hypothesis"),
    provenance: z.literal("generalized_industry_knowledge"),
  })
  .strict();

export type OpportunityPlaybookEntry = z.infer<
  typeof opportunityPlaybookEntrySchema
>;

// The slice of an entry the Flash Brief stage reads. Signals are replaced by
// the ones that actually matched, so the prompt can say why an entry applies.
export const opportunityPlaybookHintSchema = z
  .object({
    id: z.string().min(1).max(100),
    theme: opportunityPlaybookThemeSchema,
    problem_hypothesis: z.string().min(1).max(200),
    verification_dimensions: z.array(z.string().min(1).max(60)).min(1),
    suggested_question: z.string().min(1).max(200),
    potential_offerings: z.array(z.string().min(1).max(60)).min(1),
    suggested_next_action: z.string().min(1).max(200),
    matched_target_signals: z.array(z.string().min(1).max(40)),
    matched_offering_signals: z.array(z.string().min(1).max(40)),
  })
  .strict();

export type OpportunityPlaybookHint = z.infer<
  typeof opportunityPlaybookHintSchema
>;

export const maximumOpportunityPlaybookHints = 3;

// ─── Selection ───────────────────────────────────────────────────────────────

export type OpportunityPlaybookSelectionInput = Readonly<{
  /** Card department, title, company industry and role scope. */
  targetTexts: readonly (string | null | undefined)[];
  /** The user's offers, expertise, themes and current company/role. */
  offeringTexts: readonly (string | null | undefined)[];
}>;

// Words that place the person in manufacturing even when no entry-specific
// signal matched, so a "工場長" still gets entries that fit the user's offer.
const manufacturingContextSignals = [
  "製造",
  "メーカー",
  "工場",
  "生産",
  "ものづくり",
  "manufactur",
  "factory",
  "plant",
] as const;

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

function joinTexts(texts: readonly (string | null | undefined)[]): string {
  return normalize(
    texts
      .map((text) => text?.trim())
      .filter((text): text is string => Boolean(text))
      .join(" / "),
  );
}

// Latin signals must start a word: a bare substring test finds "ai" inside
// "maintenance". Japanese has no word breaks, so its signals stay substrings.
function containsSignal(haystack: string, signal: string): boolean {
  const needle = normalize(signal);

  if (!/^[a-z0-9 ]+$/.test(needle)) {
    return haystack.includes(needle);
  }

  let index = haystack.indexOf(needle);

  while (index !== -1) {
    if (index === 0 || !/[a-z0-9]/.test(haystack.charAt(index - 1))) {
      return true;
    }

    index = haystack.indexOf(needle, index + 1);
  }

  return false;
}

function matchedSignals(
  haystack: string,
  signals: readonly string[],
): string[] {
  return signals.filter((signal) => containsSignal(haystack, signal));
}

/**
 * Picks the entries that fit this person and this user.
 *
 * An entry needs a signal on the person's side. A match on the user's offer
 * alone only counts when the person is otherwise in manufacturing: selling
 * inspection AI says nothing about what a bank's HR lead deals with.
 *
 * Ranking is tiered before it is scored: an entry matching both the person and
 * the offer, then one matching only the person, then one matching only the
 * offer. A flat score let three offering keywords outrank a department match,
 * so a production-control lead got three inspection questions.
 */
export function selectOpportunityPlaybookHints(
  input: OpportunityPlaybookSelectionInput,
  playbook: readonly OpportunityPlaybookEntry[],
  limit: number = maximumOpportunityPlaybookHints,
): OpportunityPlaybookHint[] {
  const target = joinTexts(input.targetTexts);
  const offering = joinTexts(input.offeringTexts);

  if (target === "") {
    return [];
  }

  const inManufacturing =
    matchedSignals(target, manufacturingContextSignals).length > 0;

  return playbook
    .map((entry) => {
      const targetMatches = matchedSignals(target, entry.target_signals);
      const offeringMatches = matchedSignals(offering, entry.offering_signals);
      const eligible =
        targetMatches.length > 0 ||
        (inManufacturing && offeringMatches.length > 0);

      return {
        entry,
        eligible,
        offeringMatches,
        score: targetMatches.length * 2 + offeringMatches.length,
        targetMatches,
        tier:
          (targetMatches.length > 0 ? 2 : 0) +
          (offeringMatches.length > 0 ? 1 : 0),
      };
    })
    .filter((candidate) => candidate.eligible)
    .sort(
      (left, right) =>
        right.tier - left.tier ||
        right.score - left.score ||
        left.entry.id.localeCompare(right.entry.id),
    )
    .slice(0, Math.max(0, limit))
    .map(({ entry, offeringMatches, targetMatches }) =>
      opportunityPlaybookHintSchema.parse({
        id: entry.id,
        matched_offering_signals: offeringMatches,
        matched_target_signals: targetMatches,
        potential_offerings: entry.potential_offerings,
        problem_hypothesis: entry.problem_hypothesis,
        suggested_next_action: entry.suggested_next_action,
        suggested_question: entry.suggested_question,
        theme: entry.theme,
        verification_dimensions: entry.verification_dimensions,
      }),
    );
}

// The user's items that say what they sell or know. Seeking and free text say
// what they want, which is not an offering to match a playbook entry against.
const offeringContextTypes = new Set<string>([
  "current_theme",
  "expertise",
  "offer",
  "past_experience",
  "strong_skill",
]);

/**
 * Attaches the playbook entries that fit this card and this user. With
 * nothing matched, the input comes back as it was.
 */
export function attachOpportunityPlaybook(
  input: FlashBriefInput,
  playbook: readonly OpportunityPlaybookEntry[],
): FlashBriefInput {
  const company = input.company_context;
  const hints = selectOpportunityPlaybookHints(
    {
      offeringTexts: [
        input.personal_context.current_company,
        input.personal_context.current_role,
        ...input.personal_context.items
          .filter((item) => offeringContextTypes.has(item.type))
          .map((item) => item.text),
      ],
      targetTexts: [
        input.card.company,
        input.card.department,
        input.card.title,
        company?.industry,
        company?.role_scope,
      ],
    },
    playbook,
  );

  return hints.length > 0 ? { ...input, opportunity_playbook: hints } : input;
}
