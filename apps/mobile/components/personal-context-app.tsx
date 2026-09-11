import type {
  AnalyticsEventName,
  CardCorrection,
  EncounterHistoryItem,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createAnalyticsClient, type AnalyticsClient } from "../lib/analytics";
import {
  createActivationTracker,
  scanMilestoneEvents,
  toScanMilestoneSnapshot,
  type ActivationTracker,
  type ScanMilestoneSnapshot,
} from "../lib/funnel-events";
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
import {
  nextScanPollDelay,
  watchForStall,
  type StallWatch,
} from "../lib/scan-polling";
import type { InteractionRecord } from "./relationship-screens";
import { LoadingScreen, PrimaryButton } from "./ui";
import { EncounterHistoryScreen } from "./encounter-history-screen";
import { HomeScreen } from "./home-screen";
import { WelcomeScreen } from "./welcome-screen";
import { AnalysisPreparationScreen } from "./analysis-preparation-screen";

type ViewName =
  | "preparation"
  | "auth"
  | "card-details"
  | "camera"
  | "context"
  | "encounters"
  | "evidence"
  | "flash-brief"
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
      activation: ActivationTracker;
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
      const analytics = createAnalyticsClient(process.env);
      return {
        activation: createActivationTracker({
          storage: AsyncStorage,
          track: (event) => analytics.track(event),
        }),
        analytics,
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
  // Set while onboarding was opened from My Context, so it can go back there
  // and approval returns there instead of dropping the user on Home.
  const [editingContext, setEditingContext] = useState(false);
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
  const [encounters, setEncounters] = useState<EncounterHistoryItem[]>([]);
  const [encountersError, setEncountersError] = useState<string | null>(null);
  // The stored note and actions for the scan being recorded; null while read.
  const [interaction, setInteraction] = useState<InteractionRecord | null>(
    null,
  );
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [interactionReturn, setInteractionReturn] = useState<
    "flash-brief" | "mutual-value"
  >("flash-brief");
  // A freshly captured scan is not a favourite yet, and one opened from history
  // carries the value the list already loaded, so the star needs no request of
  // its own to render.
  const [scanFavorite, setScanFavorite] = useState(false);
  const [historyItems, setHistoryItems] = useState<ScanHistoryItem[] | null>(
    null,
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const scanStatusValue = scanStatus?.status;
  // Bumped when the user asks for a refresh, so a loop that stopped at its
  // budget can start over on demand.
  const [pollEpoch, setPollEpoch] = useState(0);
  // The polling effect re-runs on every status transition, so the budget has to
  // survive those re-runs. The key resets it for a new scan or a new epoch.
  const pollStart = useRef<{ key: string; startedAt: number } | null>(null);
  // Scan-funnel milestones are reported on the transition this client watched,
  // so the last observed shape of the scan has to outlive each poll.
  const observedMilestones = useRef<ScanMilestoneSnapshot | null>(null);
  // How long the scan has sat between pipeline stages, so a stopped pipeline
  // is resumed once instead of polled until the budget runs out.
  const stallWatch = useRef<StallWatch>(null);
  // Set when the server refuses to resume a scan at its retry limit. Kept
  // apart from scanStatusError, which every successful poll clears.
  const [resumeRefusedScanId, setResumeRefusedScanId] = useState<string | null>(
    null,
  );
  const scanError =
    scanResult && resumeRefusedScanId === scanResult.scan_id
      ? "この名刺は分析に繰り返し失敗したため、これ以上再試行できません。撮り直すと新しく分析できます。"
      : scanStatusError;

  const activeScanId = scanResult?.scan_id ?? null;

  // Per-scan value and trust events carry the scan, so a rate can be counted
  // once per scan even when a user answers again on a later visit.
  const trackScanEvent = useCallback(
    (
      name: AnalyticsEventName,
      properties: Readonly<
        Record<string, string | number | boolean | null>
      > = {},
    ) => {
      if (!services.ok) return;
      services.analytics.track({
        name,
        properties: { ...properties, scan_id: activeScanId },
      });
    },
    [activeScanId, services],
  );

  const noteResumeRefusal = useCallback(
    (error: unknown, refusedScanId: string) => {
      if (error instanceof ScanApiError && error.status === 429) {
        setResumeRefusedScanId(refusedScanId);
      }
    },
    [],
  );

  const loadApprovedContext = useCallback(
    async (
      activeSession: Session,
      preferredView: "context" | "home" | "preparation" = "home",
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

  // One implementation for both the automatic load on entering Home and the
  // user's pull-to-refresh. The two used to be written out separately and had
  // drifted into showing different messages for the same failure.
  const loadHistory = useCallback(async () => {
    if (!services.ok || !session) {
      return;
    }

    setHistoryItems(null);
    setHistoryError(null);

    try {
      const response = await services.scanApi.listScans(session.access_token);
      setHistoryItems(response.items);
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
        return;
      }

      setHistoryItems([]);
      setHistoryError(
        "履歴を読み込めませんでした。通信状態を確認して再試行してください。",
      );
    }
  }, [services, session]);

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
      observedMilestones.current = null;
      setScanStatusError(null);
      setRetryCapture(null);
      setEvidence(null);
      setEvidenceError(null);
      setInteraction(null);
      setInteractionError(null);
      setHistoryItems(null);
      setHistoryError(null);
      setEditingContext(false);
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
      void services.activation.trackSignup(session.user);
    } else if (session === null) {
      services.analytics.reset();
    }
  }, [session, services]);

  useEffect(() => {
    if (view !== "home") return;
    void loadHistory();
  }, [loadHistory, view]);

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

    const pollKey = `${scanResult.scan_id}:${pollEpoch}`;

    if (pollStart.current?.key !== pollKey) {
      pollStart.current = { key: pollKey, startedAt: Date.now() };
    }
    const startedAt = pollStart.current.startedAt;

    function scheduleNext(outcome: "pending" | "failed") {
      const delay = nextScanPollDelay(Date.now() - startedAt, outcome);

      if (delay === null) {
        // Budget spent. Stop rather than spin forever against a scan the
        // server may never advance; every scan screen offers a refresh.
        setScanStatusError(
          "分析に時間がかかっています。再読み込みで最新の状態を確認してください。",
        );
        return;
      }

      timeout = setTimeout(() => void poll(), delay);
    }

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

        const stall = watchForStall(
          stallWatch.current,
          nextStatus.status === "card_ready" ||
            nextStatus.status === "brief_ready"
            ? `${pollKey}:${nextStatus.status}`
            : null,
          Date.now(),
        );
        stallWatch.current = stall.next;
        if (stall.resume) {
          // Best effort. The polls that follow show whether the scan moved; a
          // refusal at the retry limit is explained on screen.
          const resumedScanId = scanResult.scan_id;
          void services.scanApi
            .resumeScan(session.access_token, resumedScanId)
            .catch((error: unknown) => noteResumeRefusal(error, resumedScanId));
        }

        const nextMilestones = toScanMilestoneSnapshot(nextStatus);
        for (const name of scanMilestoneEvents(
          observedMilestones.current,
          nextMilestones,
        )) {
          services.analytics.track({ name });
        }
        observedMilestones.current = nextMilestones;

        const destination = scanNavigationTarget(view, nextStatus.status);
        if (destination) {
          if (destination === "flash-brief") {
            services.analytics.track({ name: "brief_viewed" });
            void services.activation.trackOnce(
              session.user.id,
              "first_brief_viewed",
            );
          }
          setView(destination);
        }
        if (isScanPending(nextStatus.status)) {
          scheduleNext("pending");
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
        scheduleNext("failed");
      }
    }

    void poll();

    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [
    noteResumeRefusal,
    pollEpoch,
    scanResult,
    scanStatusValue,
    services,
    session,
    view,
  ]);

  // The "Nth meeting" badge has to be known before the user asks for it, so
  // the history is read as soon as the card resolves rather than on demand.
  const resolvedCardScanId = scanStatus?.card ? scanStatus.scan_id : null;

  useEffect(() => {
    if (!services.ok || !session || !resolvedCardScanId) {
      setEncounters([]);
      setEncountersError(null);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const response = await services.scanApi.getEncounters(
          session.access_token,
          resolvedCardScanId,
        );
        if (active) {
          setEncounters(response.items);
          setEncountersError(null);
        }
      } catch {
        // Relationship history is supporting context. A failure must leave the
        // brief itself usable, so it only suppresses the badge.
        if (active) {
          setEncounters([]);
          setEncountersError("これまでの接点を読み込めませんでした。");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [resolvedCardScanId, services, session]);

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

    await loadApprovedContext(
      session,
      editingContext ? "context" : contextReturn,
    );
    setEditingContext(false);
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
    // Re-reading the status alone cannot move a scan whose pipeline stopped,
    // so every "check again" also asks the server to continue it. Resuming is
    // idempotent: a scan that is running or finished is left alone.
    try {
      await services.scanApi.resumeScan(
        session.access_token,
        scanResult.scan_id,
      );
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
        return;
      }
      noteResumeRefusal(error, scanResult.scan_id);
      // Anything else: the status read below still shows where the scan is.
    }
    try {
      const nextStatus = await services.scanApi.getStatus(
        session.access_token,
        scanResult.scan_id,
      );
      setScanStatus(nextStatus);
      setScanStatusError(null);
      const destination = scanNavigationTarget(view, nextStatus.status);
      if (destination) setView(destination);
      // Give the polling loop a fresh budget so a wait that already gave up
      // resumes from here. The effect re-polls once on restart; that extra
      // request is the cost of the user having asked for an update.
      setPollEpoch((epoch) => epoch + 1);
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
      trackScanEvent("conversation_note_saved");
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
      trackScanEvent("next_action_created", { source, status });
      if (status === "accepted") {
        trackScanEvent("next_action_accepted", { source });
      }
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }
  }

  async function loadInteraction(): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      return;
    }

    setInteraction(null);
    setInteractionError(null);

    try {
      const [note, actions] = await Promise.all([
        services.scanApi.getNote(session.access_token, scanResult.scan_id),
        services.scanApi.listNextActions(
          session.access_token,
          scanResult.scan_id,
        ),
      ]);
      setInteraction({ actions: actions.items, note: note.note_text });
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
        return;
      }

      // Not an empty form: saving over a note that could not be read would
      // replace it, and re-offering the suggestion would record it twice.
      setInteractionError(
        "これまでの記録を読み込めませんでした。通信状態を確認して再読み込みしてください。",
      );
    }
  }

  function openInteraction(from: "flash-brief" | "mutual-value") {
    setInteractionReturn(from);
    setView("interaction");
    void loadInteraction();
  }

  async function completeNextAction(actionId: string): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      throw new Error("An authenticated scan is required.");
    }

    try {
      await services.scanApi.updateNextActionStatus(
        session.access_token,
        scanResult.scan_id,
        { action_id: actionId, status: "completed" },
      );
    } catch (error) {
      if (error instanceof ScanApiError && error.status === 401) {
        await services.supabase.auth.signOut();
      }

      throw error;
    }

    // Only the list is refreshed: reloading the whole record would remount
    // the form and discard a note the user is still typing.
    try {
      const response = await services.scanApi.listNextActions(
        session.access_token,
        scanResult.scan_id,
      );
      setInteraction((current) =>
        current ? { ...current, actions: response.items } : current,
      );
    } catch {
      // The completion itself was recorded; reflect it locally rather than
      // report a failure that did not happen.
      setInteraction((current) =>
        current
          ? {
              ...current,
              actions: current.actions.map((item) =>
                item.id === actionId
                  ? { ...item, status: "completed" as const }
                  : item,
              ),
            }
          : current,
      );
    }
  }

  async function toggleScanFavorite(next: boolean): Promise<void> {
    if (!session || !services.ok || !scanResult) {
      throw new Error("An authenticated scan is required.");
    }

    const response = await services.scanApi.setFavorite(
      session.access_token,
      scanResult.scan_id,
      next,
    );

    setScanFavorite(response.is_favorite);
    // The history list is already loaded behind this screen; leaving it stale
    // would show the star gone the moment the user goes back.
    setHistoryItems(
      (items) =>
        items?.map((item) =>
          item.scan_id === scanResult.scan_id
            ? { ...item, is_favorite: response.is_favorite }
            : item,
        ) ?? null,
    );
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

  // Named to keep the component's own `scanId` state visible here; the two are
  // unrelated and the shadowed parameter read as if deleting the active scan.
  async function deleteScan(targetScanId: string): Promise<void> {
    if (!session || !services.ok) {
      return;
    }

    try {
      await services.scanApi.deleteScan(session.access_token, targetScanId);
      setHistoryItems((current) =>
        current
          ? current.filter((item) => item.scan_id !== targetScanId)
          : current,
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

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        view === "camera" && { backgroundColor: "#000000" },
      ]}
    >
      <StatusBar style={view === "camera" ? "light" : "dark"} />
      {view === "home" && context ? (
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
            observedMilestones.current = null;
            setView("preparation");
          }}
          onDeleteScan={deleteScan}
          onOpenScan={(id) => {
            // Opening an old scan used to overwrite the meeting goal, so the
            // next capture silently inherited that scan's goal.
            setScanFavorite(
              historyItems?.find((item) => item.scan_id === id)?.is_favorite ??
                false,
            );
            setScanResult({ scan_id: id, status: "extracting" });
            setScanStatus(null);
            observedMilestones.current = null;
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
          onEdit={() => {
            setContextReturn("preparation");
            setView("context");
          }}
          onBack={() => setView("home")}
          onContinue={() => {
            services.analytics.track({ name: "scan_capture" });
            void services.activation.trackOnce(
              session.user.id,
              "first_scan_started",
            );
            setScanId(createScanId());
            setScanStatusError(null);
            setRetryCapture(null);
            setView("camera");
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
            observedMilestones.current = {
              hasBrief: false,
              hasCard: false,
              scanId: result.scan_id,
            };
            setScanFavorite(false);
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
          canRetry={retryCapture !== null}
          error={scanError}
          onCorrect={correctCard}
          onDone={() => {
            if (view === "card-details" && scanStatus?.flash_brief) {
              setView("flash-brief");
              return;
            }
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            observedMilestones.current = null;
            setScanStatusError(null);
            setRetryCapture(null);
            setView("home");
          }}
          onRecapture={() => {
            setScanId(createScanId());
            setScanResult(null);
            setScanStatus(null);
            observedMilestones.current = null;
            setScanStatusError(null);
            setRetryCapture(null);
            setView("camera");
          }}
          onRefresh={refreshScanStatus}
          onRetry={retryCardExtraction}
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
          error={scanError}
          onDone={() => {
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            observedMilestones.current = null;
            setScanStatusError(null);
            setRetryCapture(null);
            setEvidence(null);
            setEvidenceError(null);
            setView("home");
          }}
          onFlagIdentity={() =>
            trackScanEvent("identity_flagged_wrong", {
              identity_status: scanStatus.flash_brief.identity_status,
            })
          }
          onMarkHypothesisUnhelpful={() =>
            trackScanEvent("hypothesis_marked_unhelpful", {
              section: "why_you",
            })
          }
          onRateUsefulness={(rating) =>
            trackScanEvent("brief_usefulness_rated", { rating })
          }
          isFavorite={scanFavorite}
          onRefresh={refreshScanStatus}
          onToggleFavorite={toggleScanFavorite}
          onViewCard={() => setView("card-details")}
          // The note is the user's own record and never waited on the AI.
          // Gating it on Mutual Value meant a scan whose analysis failed
          // could never have its conversation written down.
          onViewInteraction={() => openInteraction("flash-brief")}
          onViewEncounters={() => setView("encounters")}
          onViewEvidence={() => {
            setView("evidence");
            void loadEvidence();
          }}
          onViewMutualValue={() => {
            services.analytics.track({ name: "mutual_value_viewed" });
            setView("mutual-value");
          }}
          previousEncounters={encounters.length}
        />
      ) : null}
      {view === "encounters" && scanStatus?.card ? (
        <EncounterHistoryScreen
          card={{
            company: scanStatus.card.company,
            name: scanStatus.card.name,
          }}
          error={encountersError}
          items={encounters}
          onBack={() => setView("flash-brief")}
          onOpenEncounter={(id) => {
            setScanResult({ scan_id: id, status: "extracting" });
            setScanStatus(null);
            observedMilestones.current = null;
            setScanStatusError(null);
            setView("scan-accepted");
          }}
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
          error={scanError}
          mutualValue={
            scanStatus.status === "deep_ready" ? scanStatus.mutual_value : null
          }
          onDone={() => {
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            observedMilestones.current = null;
            setScanStatusError(null);
            setRetryCapture(null);
            setView("home");
          }}
          onRefresh={refreshScanStatus}
          onViewBrief={() => setView("flash-brief")}
          onViewInteraction={() => openInteraction("mutual-value")}
        />
      ) : null}
      {view === "interaction" &&
      scanStatus &&
      (scanStatus.status === "brief_ready" ||
        scanStatus.status === "deep_enrichment" ||
        scanStatus.status === "deep_ready") ? (
        <InteractionScreen
          card={{
            company: scanStatus.card.company,
            name: scanStatus.card.name,
            title: scanStatus.card.title,
          }}
          error={scanError}
          loadError={interactionError}
          mutualValue={
            scanStatus.status === "deep_ready" ? scanStatus.mutual_value : null
          }
          onAcceptNextAction={async (actionText, timingText) => {
            // An action the user rewrote (or wrote without a suggestion) is
            // theirs; recording it as the AI's would inflate the measured
            // suggestion acceptance.
            const suggested =
              scanStatus.status === "deep_ready"
                ? scanStatus.mutual_value.next_action.action.trim()
                : null;
            const source = actionText.trim() === suggested ? "ai" : "user";
            await saveNextAction(actionText, timingText, source, "accepted");
          }}
          onBack={() => setView(interactionReturn)}
          onCompleteNextAction={completeNextAction}
          onDismissNextAction={async (actionText) => {
            await saveNextAction(actionText, null, "ai", "dismissed");
          }}
          onDone={() => {
            setScanId(null);
            setScanResult(null);
            setScanStatus(null);
            observedMilestones.current = null;
            setScanStatusError(null);
            setRetryCapture(null);
            setInteraction(null);
            setView("home");
          }}
          onReload={() => void loadInteraction()}
          onSaveNote={saveNote}
          onSayThisUsed={(used) =>
            trackScanEvent(used ? "say_this_used_yes" : "say_this_used_no")
          }
          record={interaction}
          sayThis={scanStatus.flash_brief.say_this}
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
          onOpenSource={(url) => {
            services.analytics.track({ name: "source_opened" });
            // A missing browser or a rejected link must not break the screen.
            void Linking.openURL(url).catch(() => {
              setEvidenceError("ソースを開けませんでした。");
            });
          }}
        />
      ) : null}
      {view === "onboarding" ? (
        <OnboardingScreen
          initialProfile={context?.profile}
          loading={busy}
          onBack={
            editingContext
              ? () => {
                  setEditingContext(false);
                  setView("context");
                }
              : undefined
          }
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
          onEditProfile={() => {
            setEditingContext(true);
            setView("onboarding");
          }}
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
