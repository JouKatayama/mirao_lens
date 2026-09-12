export const analyticsEventNames = [
  // Activation
  "signup_completed",
  "personal_context_completed",
  "first_scan_started",
  "first_brief_viewed",
  // Scan funnel
  "scan_capture",
  "scan_upload_success",
  "card_extraction_success",
  "brief_ready",
  "brief_viewed",
  "mutual_value_viewed",
  // Value
  "say_this_used_yes",
  "say_this_used_no",
  "brief_usefulness_rated",
  "conversation_note_saved",
  "next_action_created",
  "next_action_accepted",
  // The action was actually done. Acceptance alone measures intent; the
  // outcome is what says the brief changed behaviour.
  "next_action_completed",
  // Trust
  "card_corrected",
  "identity_flagged_wrong",
  "hypothesis_marked_unhelpful",
  "source_opened",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];

export type AnalyticsEventProperties = Readonly<
  Record<string, string | number | boolean | null>
>;

export type AnalyticsEvent = Readonly<{
  name: AnalyticsEventName;
  properties?: AnalyticsEventProperties;
}>;
