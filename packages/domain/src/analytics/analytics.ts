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
  "conversation_note_saved",
  "next_action_created",
  "next_action_accepted",
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
