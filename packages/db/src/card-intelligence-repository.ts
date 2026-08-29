import {
  businessCardRecordSchema,
  flashBriefSchema,
  mutualValueSchema,
  scanHistoryItemSchema,
  scanStatusResponseSchema,
  contentTypeForScanImagePath,
  toBusinessCardPublic,
  toScanHistoryStatus,
  type BusinessCardRecord,
  type CardCorrection,
  type CardExtraction,
  type CardFieldName,
  type ScanHistoryItem,
  type ScanImageContentType,
  type ScanStatusResponse,
} from "@miraio/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";
import {
  createUserScopedSupabaseClient,
  type UserScopedSupabaseConfig,
} from "./personal-context-repository";

const businessCardColumns =
  "id,scan_id,name,company,department,title,email,phone,website,address,language,field_confidence,extraction_json,user_corrected,created_at,updated_at" as const;
const rawImageBucket = "business-card-images";

export type CardIntelligenceRepositoryErrorCode =
  "database_error" | "not_found" | "storage_error";

export class CardIntelligenceRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: CardIntelligenceRepositoryErrorCode = "database_error",
  ) {
    super(`Card Intelligence persistence failed: ${operation}.`);
    this.name = "CardIntelligenceRepositoryError";
  }
}

export type CardExtractionClaim = Readonly<{
  rawImagePath: string;
  runId: string;
}>;

export type DownloadedCardImage = Readonly<{
  bytes: ArrayBuffer;
  contentType: ScanImageContentType;
}>;

export type AuthenticatedCardIntelligenceSession = Readonly<{
  repository: CardIntelligenceRepository;
  userId: string;
}>;

function mapBusinessCard(row: {
  address: string | null;
  company: string | null;
  created_at: string;
  department: string | null;
  email: string | null;
  extraction_json: Json;
  field_confidence: Json;
  id: string;
  language: string;
  name: string | null;
  phone: string | null;
  scan_id: string;
  title: string | null;
  updated_at: string;
  user_corrected: boolean;
  website: string | null;
}): BusinessCardRecord {
  return businessCardRecordSchema.parse(row);
}

export async function authenticateCardIntelligenceSession(
  config: UserScopedSupabaseConfig,
  accessToken: string,
): Promise<AuthenticatedCardIntelligenceSession | null> {
  const client = createUserScopedSupabaseClient(config, accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return {
    repository: new CardIntelligenceRepository(client),
    userId: data.user.id,
  };
}

export class CardIntelligenceRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async claimExtraction(
    scanId: string,
    provider: string,
    modelAlias: string,
  ): Promise<CardExtractionClaim | null> {
    const { data, error } = await this.client.rpc("claim_card_extraction", {
      p_model_alias: modelAlias,
      p_provider: provider,
      p_scan_id: scanId,
    });

    if (error) {
      throw new CardIntelligenceRepositoryError("claim_extraction");
    }

    const claim = data[0];

    return claim
      ? { rawImagePath: claim.raw_image_path, runId: claim.run_id }
      : null;
  }

  async downloadRawImage(rawImagePath: string): Promise<DownloadedCardImage> {
    const contentType = contentTypeForScanImagePath(rawImagePath);

    if (!contentType) {
      throw new CardIntelligenceRepositoryError(
        "resolve_raw_image_type",
        "storage_error",
      );
    }

    const { data, error } = await this.client.storage
      .from(rawImageBucket)
      .download(rawImagePath);

    if (error || !data) {
      const statusCode = Number(
        (error as { statusCode?: number | string } | null)?.statusCode,
      );

      throw new CardIntelligenceRepositoryError(
        "download_raw_image",
        statusCode === 404 ? "not_found" : "storage_error",
      );
    }

    return { bytes: await data.arrayBuffer(), contentType };
  }

  async completeExtraction(
    scanId: string,
    runId: string,
    extraction: CardExtraction,
    latencyMs: number,
  ): Promise<BusinessCardRecord> {
    const { data, error } = await this.client.rpc("persist_card_extraction", {
      p_extraction: extraction as unknown as Json,
      p_latency_ms: latencyMs,
      p_run_id: runId,
      p_scan_id: scanId,
    });

    if (error) {
      throw new CardIntelligenceRepositoryError("complete_extraction");
    }

    const card = data[0];

    if (!card) {
      throw new CardIntelligenceRepositoryError(
        "complete_extraction",
        "not_found",
      );
    }

    return mapBusinessCard(card);
  }

  async failExtraction(
    scanId: string,
    runId: string,
    errorCode: string,
    terminal: boolean,
  ): Promise<void> {
    const { data, error } = await this.client.rpc("fail_card_extraction", {
      p_error_code: errorCode,
      p_run_id: runId,
      p_scan_id: scanId,
      p_terminal: terminal,
    });

    if (error || !data) {
      throw new CardIntelligenceRepositoryError("fail_extraction");
    }
  }

  async deleteRawImage(scanId: string, rawImagePath: string): Promise<void> {
    const { error: storageError } = await this.client.storage
      .from(rawImageBucket)
      .remove([rawImagePath]);

    if (storageError) {
      throw new CardIntelligenceRepositoryError(
        "delete_raw_image",
        "storage_error",
      );
    }

    const { error: scanError } = await this.client
      .from("scans")
      .update({ raw_image_path: null })
      .eq("id", scanId)
      .eq("raw_image_path", rawImagePath);

    if (scanError) {
      throw new CardIntelligenceRepositoryError("clear_raw_image_path");
    }
  }

  async getStatus(scanId: string): Promise<ScanStatusResponse | null> {
    const { data: scan, error: scanError } = await this.client
      .from("scans")
      .select("id,status")
      .eq("id", scanId)
      .maybeSingle();

    if (scanError) {
      throw new CardIntelligenceRepositoryError("read_scan_status");
    }

    if (!scan) {
      return null;
    }

    if (
      scan.status === "failed_retryable" ||
      scan.status === "failed_terminal"
    ) {
      const { data: run, error: runError } = await this.client
        .from("ai_runs")
        .select("error_code")
        .eq("scan_id", scanId)
        .eq("stage", "card_extraction")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runError) {
        throw new CardIntelligenceRepositoryError("read_extraction_failure");
      }

      return scanStatusResponseSchema.parse({
        card: null,
        error_code: run?.error_code ?? null,
        flash_brief: null,
        mutual_value: null,
        scan_id: scanId,
        status: scan.status,
      });
    }

    const cardPresentStatuses = new Set([
      "card_ready",
      "fast_context",
      "generating_brief",
      "brief_ready",
      "deep_enrichment",
      "deep_ready",
    ]);

    if (!cardPresentStatuses.has(scan.status)) {
      return scanStatusResponseSchema.parse({
        card: null,
        error_code: null,
        flash_brief: null,
        mutual_value: null,
        scan_id: scanId,
        status: "extracting",
      });
    }

    const [cardResult, correctionResult] = await Promise.all([
      this.client
        .from("business_cards")
        .select(businessCardColumns)
        .eq("scan_id", scanId)
        .maybeSingle(),
      this.client
        .from("evidence")
        .select("source_title")
        .eq("scan_id", scanId)
        .eq("source_type", "user_correction")
        .like("source_title", "card.%"),
    ]);

    if (cardResult.error || !cardResult.data || correctionResult.error) {
      throw new CardIntelligenceRepositoryError("read_business_card");
    }

    const correctedFields = new Set(
      (correctionResult.data ?? []).flatMap((evidence) => {
        const field = evidence.source_title?.replace(/^card\./, "");

        return field &&
          [
            "name",
            "company",
            "department",
            "title",
            "email",
            "phone",
            "website",
            "address",
          ].includes(field)
          ? [field as CardFieldName]
          : [];
      }),
    );

    const card = toBusinessCardPublic(mapBusinessCard(cardResult.data), [
      ...correctedFields,
    ]);

    // Generating states: card is visible but brief is not ready yet.
    if (
      scan.status === "fast_context" ||
      scan.status === "generating_brief"
    ) {
      return scanStatusResponseSchema.parse({
        card,
        error_code: null,
        flash_brief: null,
        mutual_value: null,
        scan_id: scanId,
        status: "generating_brief",
      });
    }

    // Brief ready: deep enrichment in progress — expose flash brief only.
    if (scan.status === "brief_ready" || scan.status === "deep_enrichment") {
      const { data: analysis, error: analysisError } = await this.client
        .from("relationship_analyses")
        .select("flash_brief_json")
        .eq("scan_id", scanId)
        .maybeSingle();

      if (analysisError) {
        throw new CardIntelligenceRepositoryError("read_flash_brief");
      }

      const parsedBrief = analysis?.flash_brief_json
        ? flashBriefSchema.safeParse(analysis.flash_brief_json)
        : null;

      if (parsedBrief?.success) {
        const apiStatus =
          scan.status === "deep_enrichment" ? "deep_enrichment" : "brief_ready";

        return scanStatusResponseSchema.parse({
          card,
          error_code: null,
          flash_brief: parsedBrief.data,
          mutual_value: null,
          scan_id: scanId,
          status: apiStatus,
        });
      }

      // Brief row missing or malformed — degrade to card_ready.
      return scanStatusResponseSchema.parse({
        card,
        error_code: null,
        flash_brief: null,
        mutual_value: null,
        scan_id: scanId,
        status: "card_ready",
      });
    }

    // Deep ready: both flash brief and mutual value are available.
    if (scan.status === "deep_ready") {
      const { data: analysis, error: analysisError } = await this.client
        .from("relationship_analyses")
        .select("flash_brief_json,mutual_value_json")
        .eq("scan_id", scanId)
        .maybeSingle();

      if (analysisError) {
        throw new CardIntelligenceRepositoryError("read_mutual_value");
      }

      const parsedBrief = analysis?.flash_brief_json
        ? flashBriefSchema.safeParse(analysis.flash_brief_json)
        : null;
      const parsedMutualValue = analysis?.mutual_value_json
        ? mutualValueSchema.safeParse(analysis.mutual_value_json)
        : null;

      if (parsedBrief?.success && parsedMutualValue?.success) {
        return scanStatusResponseSchema.parse({
          card,
          error_code: null,
          flash_brief: parsedBrief.data,
          mutual_value: parsedMutualValue.data,
          scan_id: scanId,
          status: "deep_ready",
        });
      }

      if (parsedBrief?.success) {
        // Mutual value missing or malformed — degrade to brief_ready.
        return scanStatusResponseSchema.parse({
          card,
          error_code: null,
          flash_brief: parsedBrief.data,
          mutual_value: null,
          scan_id: scanId,
          status: "brief_ready",
        });
      }

      // Both missing — degrade to card_ready.
      return scanStatusResponseSchema.parse({
        card,
        error_code: null,
        flash_brief: null,
        mutual_value: null,
        scan_id: scanId,
        status: "card_ready",
      });
    }

    // card_ready — card extracted, brief not started or failed gracefully.
    return scanStatusResponseSchema.parse({
      card,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: scanId,
      status: "card_ready",
    });
  }

  async deleteScan(scanId: string, userId: string): Promise<boolean> {
    // Best-effort storage cleanup — non-fatal if images were already expired.
    const { data: files } = await this.client.storage
      .from(rawImageBucket)
      .list(`${userId}/${scanId}`);

    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${scanId}/${f.name}`);
      await this.client.storage.from(rawImageBucket).remove(paths);
    }

    const { data, error } = await this.client
      .from("scans")
      .delete()
      .eq("id", scanId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new CardIntelligenceRepositoryError("delete_scan");
    }

    return data !== null;
  }

  async deleteAccount(userId: string): Promise<void> {
    // Best-effort storage cleanup — remove all card images before deleting the account.
    const { data: folders } = await this.client.storage
      .from(rawImageBucket)
      .list(userId);

    if (folders && folders.length > 0) {
      for (const folder of folders) {
        const { data: files } = await this.client.storage
          .from(rawImageBucket)
          .list(`${userId}/${folder.name}`);

        if (files && files.length > 0) {
          const paths = files.map((f) => `${userId}/${folder.name}/${f.name}`);
          await this.client.storage.from(rawImageBucket).remove(paths);
        }
      }
    }

    // Security-definer function deletes from auth.users, cascading all user data.
    const { error } = await this.client.rpc("delete_own_account");

    if (error) {
      throw new CardIntelligenceRepositoryError("delete_account");
    }
  }

  async listScans(limit = 20): Promise<ScanHistoryItem[]> {
    const { data, error } = await this.client
      .from("scans")
      .select("id,status,meeting_goal,created_at,business_cards(name,company,title)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new CardIntelligenceRepositoryError("list_scans");
    }

    return (data ?? []).map((row) => {
      const cards = row.business_cards as
        | Array<{ name: string | null; company: string | null; title: string | null }>
        | { name: string | null; company: string | null; title: string | null }
        | null;
      const card = Array.isArray(cards) ? (cards[0] ?? null) : cards;

      return scanHistoryItemSchema.parse({
        card_company: card?.company ?? null,
        card_name: card?.name ?? null,
        card_title: card?.title ?? null,
        created_at: row.created_at,
        meeting_goal: row.meeting_goal,
        scan_id: row.id,
        status: toScanHistoryStatus(row.status),
      });
    });
  }

  async correctCard(
    scanId: string,
    correction: CardCorrection,
  ): Promise<BusinessCardRecord | null> {
    const { data, error } = await this.client.rpc("correct_business_card", {
      p_corrections: correction as unknown as Json,
      p_scan_id: scanId,
    });

    if (error) {
      throw new CardIntelligenceRepositoryError("correct_business_card");
    }

    return data[0] ? mapBusinessCard(data[0]) : null;
  }
}
