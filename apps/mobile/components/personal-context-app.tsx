import type {
  CardCorrection,
  EvidenceItem,
  MeetingGoal,
  PersonalContextItem,
  PersonalContextItemUpdate,
  PersonalContextOnboardingInput,
  PersonalContextResponse,
  ScanCreateResponse,
  ScanHistoryItem,
  ScanStatusResponse,
} from "@miraio/domain";
import { colors } from "@miraio/ui-tokens";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createAnalyticsClient, type AnalyticsClient } from "../lib/analytics";
import {
  ContextApiError,
  createPersonalContextApiClient,
} from "../lib/context-api";
import { hasUsablePersonalContext } from "../lib/context-form";
import { createScanApiClient, ScanApiError } from "../lib/scan-api";
import { createScanId, type CapturedCardImage } from "../lib/scan-capture";
import { readCapturedCardBytes } from "../lib/scan-image-file";
import { getSupabaseClient } from "../lib/supabase";
import {
  CardCaptureScreen,
  CardIntelligenceScreen,
  EvidenceScreen,
  FlashBriefScreen,
  InteractionScreen,
  MutualValueScreen,
} from "./card-scan-screens";
import {
  AuthScreen,
  MyContextScreen,
  OnboardingScreen,
  ReviewScreen,
} from "./personal-context-screens";
import { isScanPending, scanNavigationTarget } from "../lib/scan-navigation";
import { LoadingScreen, PrimaryButton } from "./ui";
import { HomeScreen } from "./home-screen";
import { WelcomeScreen } from "./welcome-screen";
import { AnalysisPreparationScreen } from "./analysis-preparation-screen";

type ViewName =
  | "preparation"
  | "auth"
  | "card-details"
  | "camera"
  | "context"
  | "evidence"
  | "flash-brief"
  | "history"
  | "home"
  | "interaction"
  | "loading"
  | "mutual-value"
  | "onboarding"
  | "review"
  | "scan-accepted"
  | "unavailable";
type Services =
  | Readonly<{
      analytics: AnalyticsClient;
      api: ReturnType<typeof createPersonalContextApiClient>;
      ok: true;
      scanApi: ReturnType<typeof createScanApiClient>;
      supabase: ReturnType<typeof getSupabaseClient>;
    }>
  | Readonly<{ error: string; ok: false }>;

export function PersonalContextApp() {
  const services = useMemo<Services>(() => {
    try {
      return {
        analytics: createAnalyticsClient(process.env),
        api: createPersonalContextApiClient(),
        ok: true,
        scanApi: createScanApiClient(),
        supabase: getSupabaseClient(),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Configuration error",
        ok: false,
      };
    }
  }, []);
  const [welcome, setWelcome] = useState(true);
  const [contextReturn, setContextReturn] = useState<"home" | "preparation">(
    "home",
  );
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [view, setView] = useState<ViewName>("loading");
  const [context, setContext] = useState<PersonalContextResponse | null>(null);
  const [drafts, setDrafts] = useState<PersonalContextItem[]>([]);
  const [meetingGoal, setMeetingGoal] = useState<MeetingGoal>("networking");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanCreateResponse | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatusResponse | null>(null);
  const [scanStatusError, setScanStatusError] = useState<string | null>(null);
  const [retryCapture, setRetryCapture] = useState<CapturedCardImage | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[] | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<ScanHistoryItem[] | null>(
    null,
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const scanStatusValue = scanStatus?.status;

  const loadApprovedContext = useCallback(
    async (
      activeSession: Session,
      preferredView: "context" | "home" = "home",
    ) => {
      if (!services.ok) {
        return;
      }

      setView("loading");
      setLoadError(null);

      try {
        const approved = await services.api.getApproved(
          activeSession.access_token,
        );
        setContext(approved);
        setView(
          hasUsablePersonalContext(approved) ? preferredView : "onboarding",
        );
      } catch (error) {
        if (error instanceof ContextApiError && error.status === 401) {
          await services.supabase.auth.signOut();
          return;
        }

        setLoadError(
          "My Contextを読み込めませんでした。通信状態を確認して再試行してください。",
        );
        setView("unavailable");
      }
    },
    [services],
  );

  useEffect(() => {
    if (!services.ok) {
      return;
    }

    let mounted = true;

    void services.supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        if (data.session) setWelcome(false);
      }
    });
    const {
      data: { subscription },
    } = services.supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [services]);

  useEffect(() => {
    if (session === undefined) {
      setView("loading");
      return;
    }

    if (session === null) {
      setContext(null);
      setDrafts([]);
      setScanId(null);
      setScanResult(null);
      setScanStatus(null);
      setScanStatusError(null);
      setRetryCapture(null);
      setEvidence(null);
      setEvidenceError(null);
      setHistoryItems(null);
      setHistoryError(null);
      setWelcome(true);
      setView("auth");
      return;
    }

    void loadApprovedContext(session);
  }, [loadApprovedContext, session]);

  useEffect(() => {
    if (!services.ok) return;
    if (session?.user.id) {
      services.analytics.identify(session.user.id);
    } else if (session === null) {
      services.analytics.reset();
    }
  }, [session, services]);

  useEffect(() => {
    if (!services.ok || !session || view !== "home") return;
    let active = true;
    setHistoryItems(null);
    setHistoryError(null);
    void services.scanApi
      .listScans(session.access_token)
      .then((response) => {
        if (active) setHistoryItems(response.items);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ScanApiError && error.status === 401) {
          void services.supabase.auth.signOut();
          return;
        }
        setHistoryItems([]);
        setHistoryError("履歴を読み込めませんでした。再試行してください。");
      });
    return () => {
      active = false;
    };
  }, [services, session, view]);

  useEffect(() => {
    if (
      !services.ok ||
      !session ||
      (view !== "scan-accepted" &&
        view !== "flash-brief" &&
        view !== "mutual-value" &&
        view !== "preparation") ||
      !scanResult ||
      (scanStatusValue !== undefined && !isScanPending(scanStatusValue))
    ) {
      return;
    }

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (!services.ok || !session || !scanResult) {
        return;
      }

      try {
        const nextStatus = await services.scanApi.getStatus(
          session.access_token,
          scanResult.scan_id,
        );

        if (!active) {
          return;
        }

        setScanStatus(nextStatus);
        setScanStatusError(null);

        const destination = scanNavigationTarget(view, nextStatus.status);
        if (destination) {
          if (destination === "flash-brief")
            services.analytics.track({ name: "brief_viewed" });
          setView(destination);
        }
        if (isScanPending(nextStatus.status)) {
          timeout = setTimeout(() => void poll(), 1500);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof ScanApiError && error.status === 401) {
          await services.supabase.auth.signOut();
          return;
        }

        setScanStatusError(
          "読み取り状態を確認できませんでした。通信状態を確認してください。",
        );
        timeout = setTimeout(() => void poll(), 3000);
      }
    }

    void poll();

    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [scanResult, scanStatusValue, services, session, view]);

  if (welcome) {
    return (
      <WelcomeScreen
        onStart={() => setWelcome(false)}
        onLogin={() => setWelcome(false)}
      />
    );
  }

  if (!services.ok) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.configurationError}>
          <Text style={styles.configurationTitle}>設定を確認してください</Text>
          <Text style={styles.configurationText}>{services.error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (view === "loading" || session === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (view === "auth" || !session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <AuthScreen client={services.supabase} />
      </SafeAreaView>
    );
  }

  if (view === "unavailable") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.configurationError}>
          <Text style={styles.configurationTitle}>接続できませんでした</Text>
          <Text style={styles.configurationText}>{loadError}</Text>
          <PrimaryButton
            label="再試行"
            onPress={() => void loadApprovedContext(session)}
          />
          <PrimaryButton
            label="ログアウト"
            onPress={() => void services.supabase.auth.signOut()}
          />
        </View>
      </SafeAreaView>
    );
  }

  async function submitOnboarding(input: PersonalContextOnboardingInput) {
    if (!session || !services.ok) {
      return;
    }

    setBusy(true);

    try {
      const response = await services.api.createOnboarding(
        session.access_token,
        input,
      );
      setDrafts(response.suggestions);
      setReviewError(null);
      setView("review");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft(itemId: string) {
    if (!session || !services.ok) {
      return;
    }

    setBusy(true);
    setReviewError(null);

    try {
      await services.api.deleteItem(session.access_token, itemId);
      setDrafts((current) => current.filter((item) => item.id !== itemId));
    } catch {
      setReviewError("候補を削除できませんでした。再試行してください。");
    } finally {
      setBusy(false);
    }
  }

  async function approveDrafts(items: PersonalContextItem[]) {
    if (!session || !services.ok) {
      return;
    }

    setBusy(true);
    setReviewError(null);
    const results = await Promise.allSettled(
      items.map((item) =>
        services.api.updateItem(session.access_token, item.id, {
          text: item.text,
          type: item.type,
          user_approved: true,
        }),
      ),
    );
    const failed = items.filter(
      (_item, index) => results[index]?.status === "rejected",
    );

    if (failed.length > 0) {
      setDrafts(failed);
      setReviewError(
        `${failed.length}件を承認できませんでした。残った項目を確認して再試行してください。`,
      );
      setBusy(false);
      return;
    }

    await loadApprovedContext(session);
    services.analytics.track({ name: "personal_context_completed" });
    setBusy(false);
  }

  async function saveItem(itemId: string, update: PersonalContextItemUpdate) {
    if (!session || !services.ok) {
      return;
    }

    setBusy(true);

    try {
      const updated = await services.api.updateItem(
        session.access_token,
        itemId,
        update,
      );
      setContext((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === itemId ? updated : item,
              ),
            }
          : current,
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteApprovedItem(itemId: string) {
    if (!session || !services.ok) {
      return;
    }

    setBusy(true);

    try {
      await services.api.deleteItem(session.access_token, itemId);
      await loadApprovedContext(session, "context");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCardImage(
    captured: CapturedCardImage,
    activeScanId: string,
  ): Promise<ScanCreateResponse> {
    if (!session || !services.ok) {
      throw new Error("An authenticated session is required.");
    }

    try {
      const created = await services.scanApi.createScan(session.access_token, {
        bytes: await readCapturedCardBytes(captured.uri),
        contentType: captured.contentType,
        meetingGoal,
        scanId: activeScanId,
      });
      services.analytics.track({ name: "scan_upload_success" });
      setRetryCapture(captured);
      return created;
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }
  }

  async function refreshScanStatus(): Promise<void> {
    if (!services.ok || !session || !scanResult) return;
    try {
      const nextStatus = await services.scanApi.getStatus(
        session.access_token,
        scanResult.scan_id,
      );
      setScanStatus(nextStatus);
      setScanStatusError(null);
      const destination = scanNavigationTarget(view, nextStatus.status);
      if (destination) setView(destination);
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
        return;
      }
      setScanStatusError("状態を確認できませんでした。再試行してください。");
    }
  }

  async function correctCard(correction: CardCorrection): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      throw new Error("An authenticated scan is required.");
    }

    try {
      setScanStatus(
        await services.scanApi.correctCard(
          session.access_token,
          scanResult.scan_id,
          correction,
        ),
      );
      setScanStatusError(null);
      services.analytics.track({ name: "card_corrected" });
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }
  }

  async function retryCardExtraction(): Promise<void> {
    if (!retryCapture || !scanId || !scanResult) {
      throw new Error("The captured card image is no longer available.");
    }

    await uploadCardImage(retryCapture, scanId);
    setScanStatus({
      card: null,
      error_code: null,
      flash_brief: null,
      mutual_value: null,
      scan_id: scanResult.scan_id,
      status: "extracting",
    });
    setScanStatusError(null);
    setView("scan-accepted");
  }

  async function saveNote(noteText: string): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      throw new Error("An authenticated scan is required.");
    }

    try {
      await services.scanApi.saveNote(
        session.access_token,
        scanResult.scan_id,
        noteText,
      );
      services.analytics.track({ name: "conversation_note_saved" });
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }
  }

  async function saveNextAction(
    actionText: string,
    timingText: string | null,
    source: "ai" | "user",
    status: "accepted" | "dismissed",
  ): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      throw new Error("An authenticated scan is required.");
    }

    try {
      await services.scanApi.saveNextAction(
        session.access_token,
        scanResult.scan_id,
        { action_text: actionText, source, status, timing_text: timingText },
      );
      services.analytics.track({ name: "next_action_created" });
      if (status === "accepted") {
        services.analytics.track({ name: "next_action_accepted" });
      }
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }
  }

  async function loadEvidence(): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      return;
    }

    setEvidence(null);
    setEvidenceError(null);

    try {
      const resp = await services.scanApi.getEvidence(
        session.access_token,
        scanResult.scan_id,
      );
      setEvidence(resp.items);
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
        return;
      }

      setEvidenceError(
        "根拠を読み込めませんでした。通信状態を確認してください。",
      );
      setEvidence([]);
    }
  }

  async function deleteScan(scanId: string): Promise<void> {
    if (!session || !services.ok) {
      return;
    }

    try {
      await services.scanApi.deleteScan(session.access_token, scanId);
      setHistoryItems((current) =>
        current ? current.filter((item) => item.scan_id !== scanId) : current,
      );
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }
  }

  async function deleteAccount(): Promise<void> {
    if (!session || !services.ok) {
      return;
    }

    await services.scanApi.deleteAccount(session.access_token);
    await services.supabase.auth.signOut();
  }

  async function loadHistory(): Promise<void> {
    if (!session || !services.ok) {
      return;
    }

    setHistoryItems(null);
    setHistoryError(null);

    try {
      const resp = await services.scanApi.listScans(session.access_token);
      setHistoryItems(resp.items);
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
        return;
      }

      setHistoryError(
        "履歴を読み込めませんでした。通信状態を確認してください。",
      );
      setHistoryItems([]);
    }
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        view === "camera" && { backgroundColor: "#000000" },
      ]}
    >
      <StatusBar style={view === "camera" ? "light" : "dark"} />
      {(view === "home" || view === "history") && context ? (
        <HomeScreen
          items={historyItems}
          error={historyError}
          onRefresh={() => void loadHistory()}
          onProfile={() => {
            setContextReturn("home");
            setView("context");
          }}
          onCapture={() => {
            setScanResult(null);
            setScanStatus(null);
            setView("preparation");
          }}
          onDeleteScan={deleteScan}
          onOpenScan={(id) => {
            const item = historyItems?.find((entry) => entry.scan_id === id);
            if (item) setMeetingGoal(item.meeting_goal);
            setScanResult({ scan_id: id, status: "extracting" });
            setScanStatus(null);
            setScanStatusError(null);
            setView("scan-accepted");
          }}
        />
      ) : null}
      {view === "preparation" && context ? (
        <AnalysisPreparationScreen
          context={context}
          meetingGoal={meetingGoal}
          onMeetingGoalChange={setMeetingGoal}
          captured={Boolean(scanResult)}
          onEdit={() => {
            setContextReturn("preparation");
            setView("context");
          }}
          onBack={() => setView(scanResult ? "flash-brief" : "home")}
          onContinue={() => {
            if (scanResult) {
              services.analytics.track({ name: "mutual_value_viewed" });
              setView("mutual-value");
            } else {
              services.analytics.track({ name: "scan_capture" });
              setScanId(createScanId());
              setScanStatusError(null);
              setRetryCapture(null);
              setView("camera");
            }
          }}
        />
      ) : null}
      {view === "camera" && scanId ? (
        <CardCaptureScreen
          onAccepted={(result) => {
            setScanResult(result);
            setScanStatus({
              card: null,
              error_code: null,
              flash_brief: null,
              mutual_value: null,
              scan_id: result.scan_id,
              status: "extracting",
            });
            setScanStatusError(null);
            setView("scan-accepted");
          }}
          onBack={() => {
            setScanId(null);
            setView("home");
          }}
          onUpload={uploadCardImage}
          scanId={scanId}
        />
      ) : null}
      {(view === "scan-accepted" || view === "card-details") && scanResult ? (
        <CardIntelligenceScreen
          error={scanStatusError}
          onCorrect={correctCard}
          onDone={() => {
            if (view === "card-details" && scanStatus?.flash_brief) {
              setView("flash-brief");
              return;
            }
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            setScanStatusError(null);
            setRetryCapture(null);
            setView("home");
          }}
          onRecapture={() => {
            setScanId(createScanId());
            setScanResult(null);
            setScanStatus(null);
            setScanStatusError(null);
            setRetryCapture(null);
            setView("camera");
          }}
          onRefresh={refreshScanStatus}
          onRetry={retryCardExtraction}
          result={scanResult}
          status={scanStatus}
        />
      ) : null}
      {view === "flash-brief" &&
      (scanStatus?.status === "brief_ready" ||
        scanStatus?.status === "deep_enrichment" ||
        scanStatus?.status === "deep_ready") &&
      scanStatus.flash_brief ? (
        <FlashBriefScreen
          brief={scanStatus.flash_brief}
          card={{
            company: scanStatus.card.company,
            name: scanStatus.card.name,
            title: scanStatus.card.title,
          }}
          deepEnriching={scanStatus.status === "deep_enrichment"}
          error={scanStatusError}
          onDone={() => {
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            setScanStatusError(null);
            setRetryCapture(null);
            setEvidence(null);
            setEvidenceError(null);
            setView("home");
          }}
          onRefresh={refreshScanStatus}
          onViewCard={() => setView("card-details")}
          onViewInteraction={
            scanStatus.status === "deep_ready"
              ? () => setView("interaction")
              : undefined
          }
          onViewEvidence={() => {
            setView("evidence");
            void loadEvidence();
          }}
          onViewMutualValue={() => setView("preparation")}
        />
      ) : null}
      {view === "mutual-value" &&
      scanStatus &&
      (scanStatus.status === "deep_enrichment" ||
        scanStatus.status === "deep_ready" ||
        scanStatus.status === "brief_ready") &&
      scanStatus.card ? (
        <MutualValueScreen
          themes={context?.items
            .filter(
              (item) => item.user_approved && item.type === "current_theme",
            )
            .map((item) => item.text)}
          potential={scanStatus.flash_brief?.potential}
          card={{
            company: scanStatus.card.company,
            name: scanStatus.card.name,
            title: scanStatus.card.title,
          }}
          error={scanStatusError}
          mutualValue={
            scanStatus.status === "deep_ready" ? scanStatus.mutual_value : null
          }
          onDone={() => {
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            setScanStatusError(null);
            setRetryCapture(null);
            setView("home");
          }}
          onRefresh={refreshScanStatus}
          onViewBrief={() => setView("flash-brief")}
          onViewInteraction={() => setView("interaction")}
        />
      ) : null}
      {view === "interaction" &&
      scanStatus?.status === "deep_ready" &&
      scanStatus.mutual_value &&
      scanStatus.card ? (
        <InteractionScreen
          card={{
            company: scanStatus.card.company,
            name: scanStatus.card.name,
            title: scanStatus.card.title,
          }}
          error={scanStatusError}
          mutualValue={scanStatus.mutual_value}
          onAcceptNextAction={async (actionText, timingText) => {
            await saveNextAction(actionText, timingText, "ai", "accepted");
          }}
          onDismissNextAction={async (actionText) => {
            await saveNextAction(actionText, null, "ai", "dismissed");
          }}
          onDone={() => {
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            setScanStatusError(null);
            setRetryCapture(null);
            setView("home");
          }}
          onSaveNote={saveNote}
          onViewMutualValue={() => setView("mutual-value")}
        />
      ) : null}
      {view === "evidence" && scanStatus?.card ? (
        <EvidenceScreen
          card={{
            company: scanStatus.card.company,
            name: scanStatus.card.name,
            title: scanStatus.card.title,
          }}
          error={evidenceError}
          items={evidence}
          onBack={() => setView("flash-brief")}
        />
      ) : null}
      {view === "onboarding" ? (
        <OnboardingScreen
          initialProfile={context?.profile}
          loading={busy}
          onSubmit={submitOnboarding}
        />
      ) : null}
      {view === "review" ? (
        <ReviewScreen
          error={reviewError}
          items={drafts}
          loading={busy}
          onApprove={approveDrafts}
          onDelete={deleteDraft}
          onItemsChange={setDrafts}
        />
      ) : null}
      {view === "context" && context ? (
        <MyContextScreen
          items={context.items}
          loading={busy}
          onBack={() => setView(contextReturn)}
          onDelete={deleteApprovedItem}
          onDeleteAccount={deleteAccount}
          onEditProfile={() => setView("onboarding")}
          onSave={saveItem}
          onSignOut={async () => {
            await services.supabase.auth.signOut();
          }}
          profile={context.profile}
        />
      ) : null}
      {view === "review" && drafts.length === 0 ? (
        <View style={styles.emptyReviewAction}>
          <PrimaryButton
            label="入力に戻る"
            onPress={() => setView("onboarding")}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  configurationError: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  configurationText: { color: colors.muted, textAlign: "center" },
  configurationTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  emptyReviewAction: { padding: 24 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
});
