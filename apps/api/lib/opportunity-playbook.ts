import { manufacturingOpportunityPlaybook } from "@miraio/ai";
import {
  attachOpportunityPlaybook,
  type FlashBriefInput,
  type OpportunityPlaybookEntry,
} from "@miraio/domain";

/**
 * Runs after Personal Context retrieval, so a narrowed profile also narrows
 * the offering side. Off, the input is returned as it was and the brief is
 * written exactly as before the playbook existed.
 */
export function withOpportunityPlaybook(
  input: FlashBriefInput,
  enabled: boolean,
  playbook: readonly OpportunityPlaybookEntry[] = manufacturingOpportunityPlaybook,
): FlashBriefInput {
  return enabled ? attachOpportunityPlaybook(input, playbook) : input;
}
