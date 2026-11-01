import { manufacturingOpportunityPlaybook } from "@miraio/ai";
import {
  selectOpportunityPlaybookHints,
  type FlashBriefInput,
  type OpportunityPlaybookEntry,
} from "@miraio/domain";

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
 * Attaches the playbook entries that fit this card and this user.
 *
 * Runs after Personal Context retrieval, so a narrowed profile also narrows
 * the offering side. Off, or with nothing matched, the input is returned as it
 * was and the brief is written exactly as before the playbook existed.
 */
export function withOpportunityPlaybook(
  input: FlashBriefInput,
  enabled: boolean,
  playbook: readonly OpportunityPlaybookEntry[] = manufacturingOpportunityPlaybook,
): FlashBriefInput {
  if (!enabled) {
    return input;
  }

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
