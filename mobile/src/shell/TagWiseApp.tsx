import { type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { bootstrapLocalDatabase, type LocalRuntime } from '../data/local/bootstrapLocalDatabase';
import type { UserOwnedDraftRecord } from '../data/local/repositories/userPartitionedLocalTypes';
import {
  type BootstrapDemoRecord,
  type DatabaseMigrationSummary,
  type LocalOwnershipProofSnapshot,
  type MobileDiagnosticsSnapshot,
  type ShellRoute,
} from '../features/app-shell/model';
import { loadLocalOwnershipProof } from '../features/app-shell/localOwnershipDemo';
import { createFetchAuthApiClient } from '../features/auth/authApiClient';
import { SessionController } from '../features/auth/sessionController';
import type { ActiveUserSession } from '../features/auth/model';
import { MobileErrorCaptureService } from '../features/diagnostics/mobileErrorCapture';
import { createFetchMobileDiagnosticsApiClient } from '../features/diagnostics/mobileDiagnosticsApiClient';
import { MobileDiagnosticsReporter } from '../features/diagnostics/mobileDiagnosticsReporter';
import { DeterministicCalculationInputError } from '../features/execution/deterministicCalculationEngine';
import { canProceedToExecutionShell } from '../features/execution/executionTemplateSelection';
import {
  SharedExecutionShellService,
  listUnsatisfiedMinimumEvidenceLabels,
  type InstrumentVisitView,
  type SharedExecutionTemplateStatus,
} from '../features/execution/sharedExecutionShellService';
import type {
  SharedExecutionChecklistOutcome,
  SharedExecutionLoopReadingPoint,
  SharedExecutionReportLifecycleState,
  SharedExecutionReportState,
  SharedExecutionShell,
  SharedExecutionStepKind,
  SharedExecutionSyncState,
} from '../features/execution/model';
import { AssignedWorkPackageCatalogService } from '../features/work-packages/assignedWorkPackageCatalogService';
import { LocalTagContextService } from '../features/work-packages/localTagContextService';
import { LocalTagEntryService } from '../features/work-packages/localTagEntryService';
import {
  LocalQrScanService,
  type LocalQrScanResult,
} from '../features/work-packages/localQrScanService';
import {
  MANUAL_INSTRUMENT_TEMPLATE_ID,
  isManualInstrumentWorkPackageId,
  type ManualInstrumentInput,
} from '../features/work-packages/manualInstrumentModel';
import {
  ManualInstrumentService,
  ManualInstrumentValidationError,
} from '../features/work-packages/manualInstrumentService';
import type {
  LocalAssignedTagEntry,
  LocalTagContext,
  LocalAssignedWorkPackageSummary,
} from '../features/work-packages/model';
import { createFetchAssignedWorkPackageApiClient } from '../features/work-packages/workPackageApiClient';
import { createFetchSupervisorReviewApiClient } from '../features/review/supervisorReviewApiClient';
import { SupervisorReviewService } from '../features/review/supervisorReviewService';
import { createFetchSupervisorAuthoringApiClient } from '../features/supervisor-authoring/supervisorAuthoringApiClient';
import { SupervisorAuthoringService } from '../features/supervisor-authoring/supervisorAuthoringService';
import { SupervisorAuthoringScreen } from '../features/supervisor-authoring/SupervisorAuthoringScreen';
import type {
  SupervisorReviewQueueItem,
  SupervisorReviewReportDetail,
} from '../features/review/model';
import {
  createFetchEvidenceUploadApiClient,
  EvidenceUploadApiError,
} from '../features/sync/evidenceUploadApiClient';
import { EvidenceUploadOrchestrator } from '../features/sync/evidenceUploadOrchestrator';
import { LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE } from '../features/sync/queueContracts';
import {
  SyncStateService,
  type ReportSyncDetail,
  type SyncRetrySummary,
  type WorkPackageSyncSummary,
} from '../features/sync/syncStateService';
import { detectConnectivityRegain } from '../features/sync/syncConnectivityRegain';
import { createEvidenceBinaryUploadBoundary } from '../platform/files/evidenceBinaryUploadBoundary';
import { normalizeApiBaseUrl, resolveApiBaseUrl } from '../platform/http/apiBaseUrl';
import { createAuthenticatedFetch } from '../platform/http/authenticatedFetch';
import { createSecureStorageBoundary } from '../platform/secure-storage/secureStorageBoundary';
import { createPhotoAcquisitionBoundary } from '../platform/media/photoAcquisitionBoundary';
import { preserveVisualCatalogAfterQrFailure } from '../features/visual-shell/serviceBackedNavigation';
import type { VisualAiDiagnosisProjectionInput } from '../features/visual-shell/serviceBackedReport';
import type { ReportSubmissionAiDiagnosisProjection } from '../features/sync/evidenceUploadApiClient';
import {
  buildTechnicianReportSummaries,
  type VisualTechnicianReportRecord,
  type VisualTechnicianReportSummary,
} from '../features/visual-shell/technicianReports';
import NetInfo from '@react-native-community/netinfo';
import '../i18n'; // initialize i18n — must be imported before any child that calls useTranslation
import { setAppLanguage } from '../i18n';
import { closeRuntimeIfInactive } from './runtimeCleanup';
import { VisualProductShell } from './VisualProductShell';

// Reachability for this offline-first LAN app means "my backend answers
// /health/live", NOT "the internet is reachable". Android's default NetInfo
// probe requires Google's connectivity-check host, which never succeeds on a
// LAN/hotspot without internet uplink — exactly the documented demo
// environment — leaving a permanent (and wrong) Offline banner. Point the
// probe at the backend's unauthenticated liveness endpoint instead.
// `useNativeReachability: false` is load-bearing on Android: without it the
// OS validated-capability short-circuits and the custom URL is ignored. The
// endpoint answers 200 (the library default expects 204), so the test must
// be overridden too.
//
// Runtime-configurable URL: this module-scope call only seeds the probe with
// the build-time/env resolution (stored preference is not readable before the
// SQLite bootstrap). `configureNetInfoReachability` is re-invoked inside the
// bootstrap effect with the EFFECTIVE runtime URL — and again whenever the
// user saves a new server URL on the login screen — so reachability always
// probes the server the app actually talks to.
function configureNetInfoReachability(apiBaseUrl: string): void {
  NetInfo.configure({
    reachabilityUrl: `${apiBaseUrl}/health/live`,
    reachabilityTest: async (response) => response.status === 200,
    reachabilityRequestTimeout: 5_000,
    useNativeReachability: false,
  });
}

configureNetInfoReachability(resolveApiBaseUrl(null));

const photoAcquisitionBoundary = createPhotoAcquisitionBoundary();
const evidenceBinaryUploadBoundary = createEvidenceBinaryUploadBoundary();

type BootstrapStatus =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | {
      type: 'ready';
      runtime: LocalRuntime;
      route: ShellRoute;
      demoRecord: BootstrapDemoRecord;
      diagnostics: MobileDiagnosticsSnapshot;
      workPackages: LocalAssignedWorkPackageSummary[];
      migrationSummary: DatabaseMigrationSummary;
      databaseName: string;
      // Effective runtime server URL (stored preference > build-time env >
      // loopback fallback). Every API client above was constructed from this
      // exact value; changing it re-runs the bootstrap so the clients are
      // rebuilt against the new server.
      apiBaseUrl: string;
      sessionController: SessionController;
      errorCapture: MobileErrorCaptureService;
      mobileDiagnosticsReporter: MobileDiagnosticsReporter;
      workPackageCatalog: AssignedWorkPackageCatalogService;
      localTagEntryService: LocalTagEntryService;
      localTagContextService: LocalTagContextService;
      executionShellService: SharedExecutionShellService;
      evidenceUploadOrchestrator: EvidenceUploadOrchestrator;
      syncStateService: SyncStateService;
      supervisorReviewService: SupervisorReviewService;
      supervisorAuthoringService: SupervisorAuthoringService;
      manualInstrumentService: ManualInstrumentService;
      session: ActiveUserSession | null;
      localOwnership: LocalOwnershipProofSnapshot | null;
      authBusy: boolean;
      packageBusy: boolean;
      syncBusy: boolean;
      reviewBusy: boolean;
      authMessage: string | null;
      packageSyncSummaries: Record<string, WorkPackageSyncSummary>;
      activeTagPackageId: string | null;
      selectedExecutionTemplateId: string | null;
      tagSearchQuery: string;
      visibleTags: LocalAssignedTagEntry[];
      technicianReports: VisualTechnicianReportSummary[];
      selectedTag: LocalAssignedTagEntry | null;
      selectedTagContext: LocalTagContext | null;
      // Story 8.11: per-template saved status for the currently-open tag so
      // the detail screen can render "Concluido" / "Falha" / "Iniciar"
      // badges next to each template option without opening every shell.
      executionTemplateStatuses: SharedExecutionTemplateStatus[];
      // Story 8.11 finding #10: per-visit aggregate view that the Report
      // screen renders as ONE relatorio across the templates the
      // technician has run on this tag.
      instrumentVisit: InstrumentVisitView | null;
      executionShell: SharedExecutionShell | null;
      reportSyncDetail: ReportSyncDetail | null;
      // Story 8.9 D-01: AI diagnosis projection for the currently-loaded
      // technician execution shell. Refreshed by `refreshReportServerStatus`
      // and by the manual "Solicitar diagnostico assistido" handler. `null`
      // when no report is loaded or the backend has not provided a state.
      executionAiDiagnosis: VisualAiDiagnosisProjectionInput | null;
      // Story 8.9 D-01: AI diagnosis projection for the currently-open
      // supervisor review report. Refreshed when the supervisor opens a
      // report and via manual request.
      supervisorAiDiagnosis: VisualAiDiagnosisProjectionInput | null;
      supervisorReviewQueue: SupervisorReviewQueueItem[];
      selectedSupervisorReviewReport: SupervisorReviewReportDetail | null;
      supervisorReturnComment: string;
      supervisorEscalationRationale: string;
      qrScannerVisible: boolean;
      qrManualPayload: string;
      qrScanResult: LocalQrScanResult | null;
      qrScanService: LocalQrScanService;
    };

export function TagWiseApp() {
  const [status, setStatus] = useState<BootstrapStatus>({ type: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  // Story 9.4: supervisor authoring overlay visibility. Kept as a separate
  // top-level state instead of threading through readyState because the
  // screen is a self-contained modal flow that only depends on the
  // supervisor session + the authoring service.
  const [supervisorAuthoringVisible, setSupervisorAuthoringVisible] = useState(false);
  // NetInfo: granular online/offline tracking independent of session mode
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  // Runtime-configurable server URL: bumping the nonce re-runs the bootstrap
  // effect below, which re-reads the persisted preference and rebuilds every
  // API client (auth + the five authed clients) against the new URL. The ref
  // carries a PT-BR confirmation message across the re-bootstrap so the
  // "Servidor atualizado" toast survives the fresh ready-state.
  const [apiBaseUrlNonce, setApiBaseUrlNonce] = useState(0);
  const pendingBootstrapMessageRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let runtimeToClose: LocalRuntime | null = null;

    async function initialize() {
      try {
        const runtime = await bootstrapLocalDatabase();
        runtimeToClose = runtime;

        if (await closeRuntimeIfInactive(runtime, isActive)) {
          return;
        }

        // Effective runtime server URL: stored preference (login-screen
        // editor) > build-time EXPO_PUBLIC_TAGWISE_API_BASE_URL > loopback.
        const storedApiBaseUrl = await runtime.repositories.appPreferences.getApiBaseUrl();
        const apiBaseUrl = resolveApiBaseUrl(storedApiBaseUrl);
        // Reachability must follow the effective runtime URL, not the
        // build-time default the module-scope call seeded.
        configureNetInfoReachability(apiBaseUrl);

        const secureStorage = createSecureStorageBoundary();
        const sessionController = new SessionController({
          apiClient: createFetchAuthApiClient(apiBaseUrl),
          secureStorage,
          authSessionCache: runtime.repositories.authSessionCache,
          localWorkState: runtime.repositories.localWorkState,
        });
        // Centralized refresh-on-401: every feature API client below (NOT the
        // auth client itself) runs through this wrapper so an expired access
        // token triggers exactly one session refresh via SessionController and
        // one retry with the renewed token. The submit-path 401 branch in
        // handleSubmitExecutionReport stays as a harmless backstop.
        const authedFetch = createAuthenticatedFetch({
          secureStorage,
          restoreSession: () => sessionController.restoreSession(),
          onSessionInvalidated: () => {
            setStatus((current) =>
              current.type !== 'ready'
                ? current
                : {
                    ...current,
                    authMessage:
                      'Sua sessao expirou. Faca login novamente para continuar sincronizando.',
                  },
            );
          },
        });
        const errorCapture = new MobileErrorCaptureService(runtime.repositories.mobileRuntimeErrors);
        const mobileDiagnosticsReporter = new MobileDiagnosticsReporter(
          runtime.repositories.mobileRuntimeErrors,
          createFetchMobileDiagnosticsApiClient({
            baseUrl: apiBaseUrl,
            secureStorage,
            fetchImplementation: authedFetch,
          }),
        );
        const workPackageCatalog = new AssignedWorkPackageCatalogService({
          apiClient: createFetchAssignedWorkPackageApiClient({
            baseUrl: apiBaseUrl,
            secureStorage,
            fetchImplementation: authedFetch,
          }),
          userPartitions: runtime.repositories.userPartitions,
        });
        const localTagEntryService = new LocalTagEntryService({
          userPartitions: runtime.repositories.userPartitions,
        });
        const localTagContextService = new LocalTagContextService({
          userPartitions: runtime.repositories.userPartitions,
        });
        const executionShellService = new SharedExecutionShellService({
          userPartitions: runtime.repositories.userPartitions,
          tagContextService: localTagContextService,
          localWorkState: runtime.repositories.localWorkState,
        });
        const evidenceUploadApiClient = createFetchEvidenceUploadApiClient({
          baseUrl: apiBaseUrl,
          secureStorage,
          fetchImplementation: authedFetch,
        });
        const evidenceUploadOrchestrator = new EvidenceUploadOrchestrator({
          userPartitions: runtime.repositories.userPartitions,
          apiClient: evidenceUploadApiClient,
          binaryUploadBoundary: evidenceBinaryUploadBoundary,
          localWorkState: runtime.repositories.localWorkState,
        });
        const syncStateService = new SyncStateService({
          userPartitions: runtime.repositories.userPartitions,
          executionShellService,
          evidenceUploadOrchestrator,
        });
        const supervisorReviewService = new SupervisorReviewService(
          createFetchSupervisorReviewApiClient({
            baseUrl: apiBaseUrl,
            secureStorage,
            fetchImplementation: authedFetch,
          }),
          // Story 10.2 (issue #4): pass the evidence client so loadReportDetail
          // can fetch pre-signed download URLs for the technician's photos
          // and the supervisor can SEE them in the review detail screen.
          evidenceUploadApiClient,
        );
        const supervisorAuthoringService = new SupervisorAuthoringService(
          createFetchSupervisorAuthoringApiClient({
            baseUrl: apiBaseUrl,
            secureStorage,
            fetchImplementation: authedFetch,
          }),
        );
        const manualInstrumentService = new ManualInstrumentService({
          userPartitions: runtime.repositories.userPartitions,
        });
        const qrScanService = new LocalQrScanService({
          userPartitions: runtime.repositories.userPartitions,
        });
        // i18n honesty (demo): the app is PT-BR single-language. The i18n
        // catalogs stay in place for post-demo wiring, but the language
        // toggle UI was removed and any previously-persisted 'en'
        // preference is ignored so the reachable ternaries render PT-BR.
        setAppLanguage('pt-BR');

        const restoredSession = await sessionController.restoreSession();
        const session =
          restoredSession.state === 'signed_in' ? restoredSession.session ?? null : null;
        const localOwnership = session
          ? await loadLocalOwnershipProof(runtime, session)
          : null;
        const diagnostics = await errorCapture.getSnapshot();
        const workPackages = session ? await workPackageCatalog.loadLocalCatalog(session) : [];
        const visibleTags = session
          ? await loadVisualShellTags(localTagEntryService, session, workPackages)
          : [];
        const technicianReports = session
          ? await loadTechnicianReportSummaries(runtime, session, visibleTags)
          : [];
        const retrySummary =
          session?.connectionMode === 'connected'
            ? await syncStateService.retryEligibleReports(session)
            : { attempted: 0, succeeded: 0, failed: 0 };
        const diagnosticReportSummary = await flushMobileDiagnosticsSafely(
          mobileDiagnosticsReporter,
          session,
        );
        const packageSyncSummaries = session
          ? await syncStateService.listWorkPackageSyncSummaries(session, workPackages)
          : {};

        if (!isActive) {
          await runtime.database.closeAsync?.();
          return;
        }

        // A message queued by handleSaveApiBaseUrl must survive the fresh
        // ready-state this re-bootstrap produces.
        const pendingBootstrapMessage = pendingBootstrapMessageRef.current;
        pendingBootstrapMessageRef.current = null;

        setStatus({
          type: 'ready',
          runtime,
          route: runtime.snapshot.shellRoute,
          demoRecord: runtime.snapshot.demoRecord,
          diagnostics,
          workPackages,
          migrationSummary: runtime.snapshot.migrationSummary,
          databaseName: runtime.snapshot.databaseName,
          apiBaseUrl,
          sessionController,
          errorCapture,
          mobileDiagnosticsReporter,
          workPackageCatalog,
          localTagEntryService,
          localTagContextService,
          executionShellService,
          evidenceUploadOrchestrator,
          syncStateService,
          supervisorReviewService,
          supervisorAuthoringService,
          manualInstrumentService,
          session,
          localOwnership,
          authBusy: false,
          packageBusy: false,
          syncBusy: false,
          reviewBusy: false,
          authMessage:
            pendingBootstrapMessage !== null
              ? pendingBootstrapMessage
              : diagnosticReportSummary.succeeded > 0
              ? `${diagnosticReportSummary.succeeded} evento(s) de diagnostico do aplicativo enviado(s).`
              : retrySummary.attempted > 0
              ? buildRetrySummaryMessage(retrySummary)
              : restoredSession.state === 'signed_in' && session?.connectionMode === 'offline'
              ? 'Sessao offline restaurada a partir do cache local.'
              : null,
          packageSyncSummaries,
          activeTagPackageId: null,
          selectedExecutionTemplateId: null,
          tagSearchQuery: '',
          visibleTags,
          technicianReports,
          selectedTag: null,
          selectedTagContext: null,
          executionTemplateStatuses: [],
          instrumentVisit: null,
          executionShell: null,
          reportSyncDetail: null,
          supervisorReviewQueue: [],
          selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
          supervisorReturnComment: '',
          supervisorEscalationRationale: '',
          qrScannerVisible: false,
          qrManualPayload: '',
          qrScanResult: null,
          qrScanService,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unknown local database bootstrap error.';
        setStatus({ type: 'error', message });
      }
    }

    initialize();

    return () => {
      isActive = false;
      void runtimeToClose?.database.closeAsync?.();
    };
    // Re-runs when the user saves a new server URL on the login screen so all
    // API clients (auth + the five authed clients) are rebuilt from it.
  }, [apiBaseUrlNonce]);

  // Story 8.8 D-06: wire `detectConnectivityRegain` into the production app
  // path. When the app comes back to foreground while the cached session is
  // 'offline', try to restore the session against the auth API. If that
  // succeeds with connectionMode 'connected', retry eligible queued reports
  // and update the visible session. Bounded: at most one regain attempt per
  // 30 seconds so a foreground/background toggle storm cannot flood the API.
  const regainBusyRef = useRef(false);
  const lastRegainAttemptAtRef = useRef(0);
  // Story: exponential backoff for connectivity-regain sync retries
  const [retryBackoffMs, setRetryBackoffMs] = useState(0);
  const retryBackoffRef = useRef(0);
  // NetInfo reports isConnected on every (re)subscription; remember the last
  // value so an actual offline→online TRANSITION can reset the backoff and
  // throttle windows (a reconnect must be acted on promptly, not after a
  // backoff inflated while offline).
  const lastNetInfoConnectedRef = useRef<boolean | null>(null);
  // Stale-closure guard for the post-reconnect AI auto-poll: the setTimeout
  // below must call the handler from the LATEST render (which sees the
  // reconnected session), not the one captured when the effect registered.
  const refreshServerStatusRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (status.type !== 'ready' || !status.session) {
      return;
    }

    const currentSession = status.session;
    const sessionController = status.sessionController;
    const syncStateService = status.syncStateService;

    async function handleConnectivityRegain() {
      if (regainBusyRef.current) return;
      // Benign short-circuit BEFORE the throttle/backoff bookkeeping: with a
      // connected session there is nothing to regain. This must not burn an
      // attempt — the NetInfo listener re-registers on every status identity
      // change and fires immediately, so counting these calls used to inflate
      // the backoff to its cap during normal connected use.
      if (currentSession.connectionMode === 'connected') return;
      const now = Date.now();
      if (now - lastRegainAttemptAtRef.current < 30_000) return;
      // Exponential backoff: skip if still within backoff window
      if (now < retryBackoffRef.current) return;
      lastRegainAttemptAtRef.current = now;
      regainBusyRef.current = true;

      try {
        const result = await detectConnectivityRegain({
          currentSession,
          restoreSession: () => sessionController.restoreSession(),
          retryEligibleReports: (session) =>
            syncStateService.retryEligibleReports(session),
        });

        if (result.state !== 'reconnected') {
          // Back off only on outcomes that represent a real failed network
          // attempt; benign outcomes ('no-session' / 'already-connected')
          // must not inflate the window that suppresses future attempts.
          if (result.state === 'still-offline' || result.state === 'signed-out') {
            retryBackoffRef.current = Date.now() + Math.min((retryBackoffMs || 0) * 2 || 5000, 300_000);
            setRetryBackoffMs((prev) => Math.min(prev * 2 || 5000, 300_000));
          }
          return;
        }

        // Successful reconnect: reset backoff
        retryBackoffRef.current = 0;
        setRetryBackoffMs(0);

        const retrySummary = result.retrySummary;
        setStatus((current) => {
          if (current.type !== 'ready') return current;
          const summaryMessage =
            retrySummary.attempted === 0
              ? 'Conexao restaurada. Nada na fila local para sincronizar.'
              : `Conexao restaurada. Sincronizados ${retrySummary.succeeded} de ${retrySummary.attempted} itens da fila local.`;
          return {
            ...current,
            session: result.session,
            authMessage: summaryMessage,
          };
        });

        // Auto-poll AI diagnosis status after successful sync
        if (retrySummary.succeeded > 0) {
          // Give the server a moment to process the AI job. Call through the
          // ref so the handler sees the post-reconnect state instead of the
          // pre-reconnect closure captured by this effect.
          setTimeout(() => {
            void refreshServerStatusRef.current();
          }, 3000);
        }
      } finally {
        regainBusyRef.current = false;
      }
    }

    async function handleForeground(nextState: AppStateStatus) {
      if (nextState !== 'active') return;
      await handleConnectivityRegain();
    }

    const subscription = AppState.addEventListener('change', handleForeground);

    // NetInfo subscription catches reconnects while app stays in foreground.
    // With the module-level NetInfo.configure above, isInternetReachable now
    // means "the backend /health/live answered" — so the offline banner
    // reflects backend reachability, not internet reachability.
    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(
        state.isConnected === null
          ? null
          : state.isConnected && state.isInternetReachable,
      );
      if (state.isConnected === true && lastNetInfoConnectedRef.current === false) {
        // Fresh offline→online transition: act promptly instead of waiting
        // out a throttle/backoff window inflated while offline.
        lastRegainAttemptAtRef.current = 0;
        retryBackoffRef.current = 0;
        setRetryBackoffMs(0);
      }
      if (state.isConnected !== null) {
        lastNetInfoConnectedRef.current = state.isConnected;
      }
      // Trigger on link-level connectivity alone: detectConnectivityRegain
      // performs the authoritative cheap check (short-timeout refresh POST
      // against the backend), so we must not gate on the reachability probe
      // (it can lag or misfire on LAN-only networks).
      if (state.isConnected) {
        void handleConnectivityRegain();
      }
    });

    return () => {
      subscription.remove();
      netInfoUnsubscribe();
    };
  }, [status, retryBackoffMs]);

  if (status.type === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.centeredState}>
          <ActivityIndicator color="#0f766e" size="large" />
          <Text style={styles.stateTitle}>Initializing local shell</Text>
          <Text style={styles.stateBody}>
            TagWise is opening the device database and preparing the offline foundation.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status.type === 'error') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.centeredState}>
          <Text style={styles.errorTitle}>Local bootstrap failed</Text>
          <Text style={styles.stateBody}>{status.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const readyState = status;

  // Runtime-configurable server URL (login screen, signed-out only): persist
  // the normalized URL in app_preferences and re-run the bootstrap so every
  // API client is rebuilt against it. Returns false (with a PT-BR error
  // message) for invalid input, in which case nothing is persisted.
  async function handleSaveApiBaseUrl(rawUrl: string): Promise<boolean> {
    if (status.type !== 'ready') {
      return false;
    }

    const normalized = normalizeApiBaseUrl(rawUrl);
    if (normalized === null) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                'URL do servidor invalida. Use o formato http://host:porta (ex.: http://192.168.0.10:4100).',
            },
      );
      return false;
    }

    try {
      await readyState.runtime.repositories.appPreferences.setApiBaseUrl(normalized);
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof Error
                  ? `Falha ao salvar a URL do servidor: ${error.message}`
                  : 'Falha ao salvar a URL do servidor.',
            },
      );
      return false;
    }

    pendingBootstrapMessageRef.current = `Servidor atualizado: ${normalized}`;
    setApiBaseUrlNonce((nonce) => nonce + 1);
    return true;
  }

  async function handleSignIn() {
    if (status.type !== 'ready') {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            authBusy: true,
            authMessage: null,
          },
    );

    try {
      const session = await readyState.sessionController.signInConnected({
        email,
        password,
      });
      const localOwnership = await loadLocalOwnershipProof(readyState.runtime, session);
      let workPackages = await readyState.workPackageCatalog.loadLocalCatalog(session);
      let authMessage = 'Sessao online estabelecida e armazenada em cache para uso offline.';

      try {
        workPackages = await readyState.workPackageCatalog.refreshConnectedCatalog(session);
        authMessage = `Sessao online estabelecida; ${workPackages.length} pacote(s) atribuido(s) carregado(s).`;
      } catch (packageError) {
        authMessage = `${authMessage} Nao foi possivel atualizar os pacotes atribuidos: ${
          packageError instanceof Error
            ? packageError.message
            : 'erro desconhecido ao atualizar pacotes.'
        }`;
      }
      const retrySummary = await readyState.syncStateService.retryEligibleReports(session);
      const diagnosticReportSummary = await flushMobileDiagnosticsSafely(
        readyState.mobileDiagnosticsReporter,
        session,
      );
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        session,
        workPackages,
      );
      const visibleTags = await loadVisualShellTags(
        readyState.localTagEntryService,
        session,
        workPackages,
      );
      const technicianReports = await loadTechnicianReportSummaries(
        readyState.runtime,
        session,
        visibleTags,
      );

      if (retrySummary.attempted > 0) {
        authMessage = `${authMessage} ${buildRetrySummaryMessage(retrySummary)}`;
      }
      if (diagnosticReportSummary.succeeded > 0) {
        authMessage = `${authMessage} ${diagnosticReportSummary.succeeded} evento(s) de diagnostico do aplicativo enviado(s).`;
      }

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              session,
              localOwnership,
              workPackages,
              packageSyncSummaries,
              authBusy: false,
              authMessage,
              activeTagPackageId: null,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags,
              technicianReports,
              selectedTag: null,
              selectedTagContext: null,
              executionShell: null,
              reportSyncDetail: null,
              supervisorReviewQueue: [],
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              qrScannerVisible: false,
              qrManualPayload: '',
              qrScanResult: null,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authBusy: false,
              authMessage:
                error instanceof Error ? error.message : 'Autenticacao online falhou.',
            },
      );
    }
  }

  // Returns true when the refresh fully succeeded so callers (the one-tap
  // "Sincronizar com servidor" flow) can surface an HONEST result message
  // instead of unconditionally claiming success. `sessionOverride` lets the
  // sync flow pass a just-reconnected session that is not in state yet.
  async function handleRefreshAssignedPackages(
    sessionOverride?: ActiveUserSession,
  ): Promise<boolean> {
    if (status.type !== 'ready') {
      return false;
    }
    const session = sessionOverride ?? readyState.session;
    if (!session) {
      return false;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            packageBusy: true,
            authMessage: null,
          },
    );

    try {
      // Story 10.1: before fetching the new catalog, pull down the latest
      // server-side lifecycle for every in-flight report so any supervisor
      // approvals / returns / escalations the technician hasn't seen yet
      // are reflected in both the rollup status (Em revisao -> Atencao /
      // Concluido) and the per-template state on tap-in.
      await readyState.syncStateService.refreshInflightReportStatuses(session);
      const workPackages = await readyState.workPackageCatalog.refreshConnectedCatalog(
        session,
      );
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        session,
        workPackages,
      );
      const visibleTags = await loadVisualShellTags(
        readyState.localTagEntryService,
        session,
        workPackages,
      );
      const technicianReports = await loadTechnicianReportSummaries(
        readyState.runtime,
        session,
        visibleTags,
      );
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              workPackages,
              packageSyncSummaries,
              packageBusy: false,
              authMessage: `${workPackages.length} pacote(s) atribuido(s) atualizado(s) para uso offline.`,
              activeTagPackageId: null,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags,
              technicianReports,
              selectedTag: null,
              selectedTagContext: null,
              executionShell: null,
              reportSyncDetail: null,
              supervisorReviewQueue: [],
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              qrScannerVisible: false,
              qrScanResult: null,
            },
      );
      return true;
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              packageBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao atualizar os pacotes atribuidos.',
            },
      );
      return false;
    }
  }

  // Story 10.7 (follow-up to issue #5): one-tap "Sincronizar com servidor"
  // affordance on the dashboard. A REAL full sync, not pull-only:
  // 1. offline session → attempt the connectivity-regain probe inline
  //    instead of dead-ending with a "reconnect first" instruction;
  // 2. drain the outbound queue (queued report submissions + photo
  //    evidence) BEFORE pulling so the pulls pick up what we just pushed;
  // 3. refresh the package catalog + every in-flight report's server
  //    lifecycle (supervisor decisions, incl. returns, land here);
  // 4. for supervisor / manager: also refresh the review queue;
  // 5. surface an honest PT-BR result (what synced, what failed) instead
  //    of an unconditional success toast.
  async function handleSyncWithServer() {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    let session = readyState.session;

    if (session.connectionMode !== 'connected') {
      const regain = await detectConnectivityRegain({
        currentSession: session,
        restoreSession: () => readyState.sessionController.restoreSession(),
        // The outbound drain runs explicitly below; keep the regain probe
        // itself cheap.
        retryEligibleReports: async () => ({ attempted: 0, succeeded: 0, failed: 0 }),
      });
      if (regain.state !== 'reconnected') {
        setStatus((current) =>
          current.type !== 'ready'
            ? current
            : {
                ...current,
                authMessage:
                  'Servidor indisponivel no momento. Suas alteracoes permanecem salvas no aparelho; tente novamente quando a conexao voltar.',
              },
        );
        return;
      }
      session = regain.session;
      const reconnectedSession = session;
      setStatus((current) =>
        current.type !== 'ready' ? current : { ...current, session: reconnectedSession },
      );
    }

    let retrySummary: SyncRetrySummary = { attempted: 0, succeeded: 0, failed: 0 };
    let outboundDrainError: string | null = null;
    try {
      retrySummary = await readyState.syncStateService.retryEligibleReports(session);
    } catch (error) {
      outboundDrainError =
        error instanceof Error ? error.message : 'Falha ao enviar a fila local.';
    }

    const packagesOk = await handleRefreshAssignedPackages(session);
    const isReviewer = session.role === 'supervisor' || session.role === 'manager';
    const reviewOk = isReviewer ? await handleRefreshSupervisorReviewQueue(session) : true;

    const failures: string[] = [];
    if (outboundDrainError) {
      failures.push(`fila local (${outboundDrainError})`);
    } else if (retrySummary.failed > 0) {
      failures.push(`${retrySummary.failed} envio(s) pendente(s)`);
    }
    if (!packagesOk) {
      failures.push('pacotes atribuidos');
    }
    if (isReviewer && !reviewOk) {
      failures.push('fila de revisao');
    }

    const pushSummary =
      retrySummary.attempted > 0
        ? ` ${retrySummary.succeeded} de ${retrySummary.attempted} envio(s) pendente(s) enviado(s).`
        : '';

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            authMessage:
              failures.length === 0
                ? `Sincronizacao com o servidor concluida.${pushSummary}`
                : `Sincronizacao parcial.${pushSummary} Falhou: ${failures.join(', ')}.`,
          },
    );
  }

  async function handleDownloadAssignedPackage(workPackageId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            packageBusy: true,
            authMessage: null,
          },
    );

    try {
      const result = await readyState.workPackageCatalog.downloadAssignedPackage(
        readyState.session,
        workPackageId,
      );
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        result.summaries,
      );
      const visibleTags = await readyState.localTagEntryService.listPackageTags(
        readyState.session,
        result.snapshot.summary.id,
      );
      const technicianReports = await loadTechnicianReportSummaries(
        readyState.runtime,
        readyState.session,
        visibleTags,
      );
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              workPackages: result.summaries,
              packageSyncSummaries,
              packageBusy: false,
              authMessage: `Pacote ${result.snapshot.summary.id} baixado localmente com ${visibleTags.length} tag(s) em cache.`,
              activeTagPackageId: result.snapshot.summary.id,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags,
              technicianReports,
              selectedTag: null,
              selectedTagContext: null,
              executionShell: null,
              reportSyncDetail: null,
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              qrScannerVisible: false,
              qrScanResult: null,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              packageBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao baixar o pacote atribuido, sem mensagem detalhada.',
            },
      );
    }
  }

  // Story 8.13: wipe local execution state for a single work package so
  // the technician can re-download fresh data after a seed change. Run
  // synchronously inside the catalog service; clear any in-memory
  // references to the deleted package so the UI cannot try to read
  // stale local rows.
  async function handleDeleteLocalPackage(workPackageId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            packageBusy: true,
            authMessage: null,
          },
    );

    try {
      const summaries = await readyState.workPackageCatalog.deleteLocalPackage(
        readyState.session,
        workPackageId,
      );
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        summaries,
      );
      const wasActive = readyState.activeTagPackageId === workPackageId;
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              workPackages: summaries,
              packageSyncSummaries,
              packageBusy: false,
              authMessage:
                'Pacote local apagado. Toque em "Baixar" para sincronizar a versao mais recente.',
              activeTagPackageId: wasActive ? null : current.activeTagPackageId,
              tagSearchQuery: wasActive ? '' : current.tagSearchQuery,
              visibleTags: wasActive ? [] : current.visibleTags,
              selectedTag: wasActive ? null : current.selectedTag,
              selectedTagContext: wasActive ? null : current.selectedTagContext,
              selectedExecutionTemplateId: wasActive
                ? null
                : current.selectedExecutionTemplateId,
              executionTemplateStatuses: wasActive ? [] : current.executionTemplateStatuses,
              instrumentVisit: wasActive ? null : current.instrumentVisit,
              executionShell: wasActive ? null : current.executionShell,
              reportSyncDetail: wasActive ? null : current.reportSyncDetail,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              packageBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao apagar o pacote local.',
            },
      );
    }
  }

  async function handleBrowsePackageTags(workPackageId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    const visibleTags = await readyState.localTagEntryService.listPackageTags(
      readyState.session,
      workPackageId,
    );
    const reportTags = await loadVisualShellTags(
      readyState.localTagEntryService,
      readyState.session,
      readyState.workPackages,
    );
    const technicianReports = await loadTechnicianReportSummaries(
      readyState.runtime,
      readyState.session,
      reportTags,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            activeTagPackageId: workPackageId,
            selectedExecutionTemplateId: null,
            tagSearchQuery: '',
            visibleTags,
            technicianReports,
            selectedTag: null,
            selectedTagContext: null,
            executionShell: null,
            qrScanResult: null,
            authMessage:
              visibleTags.length > 0
                ? `${visibleTags.length} tag(s) em cache carregada(s) do pacote ${workPackageId}.`
                : `Nenhuma tag em cache disponivel no pacote ${workPackageId}. Baixe o pacote primeiro.`,
          },
    );
  }

  async function handleCreateManualInstrument(input: ManualInstrumentInput): Promise<boolean> {
    if (status.type !== 'ready' || !readyState.session) {
      return false;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            packageBusy: true,
            authMessage: null,
          },
    );

    try {
      const result = await readyState.manualInstrumentService.createManualInstrument(
        readyState.session,
        input,
      );
      const workPackages = await readyState.workPackageCatalog.loadLocalCatalog(readyState.session);
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        workPackages,
      );
      const visibleTags = await readyState.localTagEntryService.listPackageTags(
        readyState.session,
        result.workPackageId,
      );
      const selectedTag =
        visibleTags.find((tag) => tag.tagId === result.tagId) ??
        (await readyState.localTagEntryService.selectPackageTag(
          readyState.session,
          result.workPackageId,
          result.tagId,
        ));
      const selectedTagContext = await readyState.localTagContextService.getTagContext(
        readyState.session,
        result.workPackageId,
        result.tagId,
      );
      const selectedExecutionTemplateId =
        selectedTagContext?.referencePointers.executionTemplates[0]?.id ??
        MANUAL_INSTRUMENT_TEMPLATE_ID;
      const reportTags = await loadVisualShellTags(
        readyState.localTagEntryService,
        readyState.session,
        workPackages,
      );
      const technicianReports = await loadTechnicianReportSummaries(
        readyState.runtime,
        readyState.session,
        reportTags,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              workPackages,
              packageSyncSummaries,
              packageBusy: false,
              authMessage:
                'Instrumento manual salvo localmente. Aguarda reconciliacao e nao sera tratado como ativo oficial do backend.',
              activeTagPackageId: result.workPackageId,
              selectedExecutionTemplateId,
              tagSearchQuery: '',
              visibleTags,
              technicianReports,
              selectedTag,
              selectedTagContext,
              executionShell: null,
              reportSyncDetail: null,
              qrScanResult: null,
            },
      );

      return true;
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              packageBusy: false,
              authMessage:
                error instanceof ManualInstrumentValidationError || error instanceof Error
                  ? error.message
                  : 'Falha ao criar o instrumento manual, sem mensagem detalhada.',
            },
      );
      return false;
    }
  }

  async function openTagContext(entry: LocalAssignedTagEntry): Promise<boolean> {
    if (status.type !== 'ready' || !readyState.session) {
      return false;
    }

    const selectedTagContext = await readyState.localTagContextService.getTagContext(
      readyState.session,
      entry.workPackageId,
      entry.tagId,
    );
    // Story 8.11: load any previously-saved test statuses for this tag so
    // the detail screen can render per-template badges immediately,
    // including those from earlier visits within this session.
    const executionTemplateStatuses = await readyState.executionShellService.listTemplateStatusesForTag(
      readyState.session,
      entry.workPackageId,
      entry.tagId,
    );
    // Story 8.11 finding #10: load the per-visit aggregate so the Report
    // screen can render ONE relatorio across all templates the
    // technician has run on this tag.
    const instrumentVisit = await readyState.executionShellService.loadVisitForTag(
      readyState.session,
      entry.workPackageId,
      entry.tagId,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            activeTagPackageId: entry.workPackageId,
            selectedExecutionTemplateId: null,
            selectedTag: entry,
            selectedTagContext,
            executionTemplateStatuses,
            instrumentVisit,
            executionShell: null,
            authMessage: selectedTagContext
              ? `Contexto da tag ${entry.tagCode} carregado localmente.`
              : 'O contexto da tag selecionada nao esta disponivel no armazenamento local.',
            },
    );

    return true;
  }

  async function handleOpenVisualTag(identity: {
    workPackageId: string;
    tagId: string;
  }): Promise<boolean> {
    if (status.type !== 'ready' || !readyState.session) {
      return false;
    }

    const selectedTag = await readyState.localTagEntryService.selectPackageTag(
      readyState.session,
      identity.workPackageId,
      identity.tagId,
    );

    if (!selectedTag) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              activeTagPackageId: identity.workPackageId,
              selectedTag: null,
              selectedTagContext: null,
              selectedExecutionTemplateId: null,
              executionShell: null,
              authMessage: 'A tag selecionada nao esta mais disponivel no pacote local.',
            },
      );
      return false;
    }

    return openTagContext(selectedTag);
  }

  async function handleOpenTechnicianReport(
    report: VisualTechnicianReportSummary,
  ): Promise<boolean> {
    if (status.type !== 'ready' || !readyState.session) {
      return false;
    }

    const selectedTag = await readyState.localTagEntryService.selectPackageTag(
      readyState.session,
      report.workPackageId,
      report.tagId,
    );

    if (!selectedTag) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage: 'Relatorio local encontrado, mas a tag nao esta mais no cache.',
            },
      );
      return false;
    }

    const selectedTagContext = await readyState.localTagContextService.getTagContext(
      readyState.session,
      report.workPackageId,
      report.tagId,
    );
    const executionShell = await readyState.executionShellService.loadShell(
      readyState.session,
      report.workPackageId,
      report.tagId,
      report.templateId,
    );
    const reportSyncDetail = executionShell
      ? await readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell)
      : null;

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            activeTagPackageId: report.workPackageId,
            selectedExecutionTemplateId: report.templateId,
            selectedTag,
            selectedTagContext,
            executionShell,
            reportSyncDetail,
            authMessage: executionShell
              ? `Relatorio local aberto para ${executionShell.tagCode}.`
              : 'Nao foi possivel carregar o relatorio local desta tag.',
          },
    );

    return Boolean(executionShell);
  }

  async function loadCurrentTechnicianReports(
    state: Extract<BootstrapStatus, { type: 'ready' }>,
  ): Promise<VisualTechnicianReportSummary[]> {
    if (!state.session) {
      return [];
    }

    const reportTags = await loadVisualShellTags(
      state.localTagEntryService,
      state.session,
      state.workPackages,
    );
    return loadTechnicianReportSummaries(state.runtime, state.session, reportTags);
  }

  async function handleProceedToExecutionShell(): Promise<boolean> {
    const selectedTemplateId = readyState.selectedExecutionTemplateId;

    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.selectedTag ||
      !readyState.selectedTagContext ||
      !selectedTemplateId ||
      !canProceedToExecutionShell(
        readyState.selectedTagContext.referencePointers.executionTemplates,
        selectedTemplateId,
      )
    ) {
      return false;
    }

    const executionShell = await readyState.executionShellService.loadShell(
      readyState.session,
      readyState.selectedTag.workPackageId,
      readyState.selectedTag.tagId,
      selectedTemplateId,
    );
    const reportSyncDetail = executionShell
      ? await readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell)
      : null;

    setStatus((current) =>
      current.type !== 'ready'
        ? current
          : {
              ...current,
              executionShell,
              reportSyncDetail,
              authMessage: executionShell
                ? `Teste local aberto para ${executionShell.tagCode}.`
                : 'Nao ha contrato local de teste para esta tag.',
          },
    );

    return Boolean(executionShell);
  }

  async function handleOpenExecutionTemplate(templateId: string): Promise<boolean> {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.selectedTag ||
      !readyState.selectedTagContext ||
      !canProceedToExecutionShell(
        readyState.selectedTagContext.referencePointers.executionTemplates,
        templateId,
      )
    ) {
      return false;
    }

    const executionShell = await readyState.executionShellService.loadShell(
      readyState.session,
      readyState.selectedTag.workPackageId,
      readyState.selectedTag.tagId,
      templateId,
    );
    const reportSyncDetail = executionShell
      ? await readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell)
      : null;

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            selectedExecutionTemplateId: templateId,
            executionShell,
            reportSyncDetail,
            authMessage: executionShell
              ? `Teste local aberto para ${executionShell.tagCode}.`
              : 'Nao ha contrato local de teste para esta tag.',
          },
    );

    return Boolean(executionShell);
  }

  function handleSelectExecutionTemplate(templateId: string) {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            selectedExecutionTemplateId: templateId,
            executionShell: null,
          },
    );
  }

  function handleExecutionCalculationInputChange(
    key: 'expectedValue' | 'observedValue',
    value: string,
  ) {
    setStatus((current) =>
      current.type !== 'ready' ||
      !current.executionShell ||
      !current.executionShell.calculation ||
      !isTechnicianEditableReportState(current.executionShell.report)
        ? current
        : {
            ...current,
            executionShell: {
              ...current.executionShell,
              calculation: {
                ...current.executionShell.calculation,
                rawInputs: {
                  ...current.executionShell.calculation.rawInputs,
                  [key]: value,
                },
              },
            },
          },
    );
  }

  function handleChecklistOutcomeChange(
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    const executionShell = readyState.executionShellService.updateChecklistOutcome(
      readyState.executionShell,
      checklistItemId,
      outcome,
    );

    setStatus((current) =>
      current.type !== 'ready' ? current : { ...current, executionShell },
    );

    // QA P1 S-03: auto-persist the toggle. Navigating back to the tag hub
    // reloads the shell FROM DISK, so an unsaved toggle would silently
    // reset. The save is a cheap idempotent draft upsert; keep it silent
    // (no authMessage churn) and keep the explicit "Salvar checklist"
    // button as the visible persistence affordance.
    void readyState.executionShellService
      .saveGuidanceEvidence(readyState.session, executionShell)
      .catch(() => {
        // Best-effort autosave; the explicit save button remains the
        // recovery path if this background write fails.
      });
  }

  function handleObservationNotesChange(value: string) {
    setStatus((current) =>
      current.type !== 'ready' ||
      !current.executionShell ||
      !isTechnicianEditableReportState(current.executionShell.report)
        ? current
        : {
            ...current,
            executionShell: current.executionShellService.updateObservationNotes(
              current.executionShell,
              value,
            ),
          },
    );
  }

  function handleRiskJustificationChange(riskItemId: string, justificationText: string) {
    setStatus((current) =>
      current.type !== 'ready' ||
      !current.executionShell ||
      !isTechnicianEditableReportState(current.executionShell.report)
        ? current
        : {
            ...current,
            executionShell: current.executionShellService.updateRiskJustification(
              current.executionShell,
              riskItemId,
              justificationText,
            ),
          },
    );
  }

  function handleReportReviewNotesChange(value: string) {
    setStatus((current) =>
      current.type !== 'ready' ||
      !current.executionShell ||
      !isTechnicianEditableReportState(current.executionShell.report)
        ? current
        : {
            ...current,
            executionShell: current.executionShellService.updateReportReviewNotes(
              current.executionShell,
              value,
            ),
          },
    );
  }

  async function handleSaveExecutionCalculation() {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell?.calculation ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    try {
      const executionShell = await readyState.executionShellService.saveCalculation(
        readyState.session,
        readyState.executionShell,
        readyState.executionShell.calculation.rawInputs,
      );
      const technicianReports = await loadCurrentTechnicianReports(readyState);
      // Story 8.11: refresh per-template status + per-visit aggregate so
      // the detail screen reflects the new "Concluido" / "Falha" badge
      // and the Report screen picks up the new test in the visit summary.
      const executionTemplateStatuses = await readyState.executionShellService.listTemplateStatusesForTag(
        readyState.session,
        executionShell.workPackageId,
        executionShell.tagId,
      );
      const instrumentVisit = await readyState.executionShellService.loadVisitForTag(
        readyState.session,
        executionShell.workPackageId,
        executionShell.tagId,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionShell,
              executionTemplateStatuses,
              instrumentVisit,
              technicianReports,
              authMessage: executionShell.calculation?.result
                ? `Calculo salvo localmente para ${executionShell.tagCode}.`
                : current.authMessage,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof DeterministicCalculationInputError || error instanceof Error
                  ? error.message
                  : 'Falha no calculo deterministico, sem mensagem detalhada.',
            },
      );
    }
  }

  async function handleSaveExecutionEvidence() {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.saveGuidanceEvidence(
      readyState.session,
      readyState.executionShell,
    );
    const technicianReports = await loadCurrentTechnicianReports(readyState);
    // Story 8.11: keep the per-visit aggregate in sync so any newly
    // added observation notes / risk justifications flow into the
    // Report screen's visit summary.
    const instrumentVisit = await readyState.executionShellService.loadVisitForTag(
      readyState.session,
      executionShell.workPackageId,
      executionShell.tagId,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            instrumentVisit,
            technicianReports,
            authMessage: `Checklist, observacoes e justificativas salvos localmente para ${executionShell.tagCode}.`,
          },
    );
  }

  // Story 8.15: persist the per-point loop test detail so the loop
  // screen can rehydrate the curve on next visit and the Report
  // screen can render a formatted results section.
  async function handleSaveLoopTestEvidence(input: {
    points: SharedExecutionLoopReadingPoint[];
    inputMode: 'pv' | 'ma';
    worstCase: { rawInputs: { expectedValue: string; observedValue: string } } | null;
  }) {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.saveLoopTestEvidence(
      readyState.session,
      readyState.executionShell,
      input,
    );
    const technicianReports = await loadCurrentTechnicianReports(readyState);
    const executionTemplateStatuses =
      await readyState.executionShellService.listTemplateStatusesForTag(
        readyState.session,
        executionShell.workPackageId,
        executionShell.tagId,
      );
    const instrumentVisit = await readyState.executionShellService.loadVisitForTag(
      readyState.session,
      executionShell.workPackageId,
      executionShell.tagId,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            executionTemplateStatuses,
            instrumentVisit,
            technicianReports,
            authMessage: `Loop salvo com ${input.points.length} ponto(s) localmente.`,
          },
    );
  }

  async function handleSaveLoopTestNote(_note: string) {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    // Story 8.14 finding #7: the previous behavior merged a formatted
    // loop-test text block into shell.evidence.observationNotes. The
    // user reported that the "Observacoes do tecnico" field should be
    // pure free-form technician comments only, not auto-injected test
    // data. The loop test's per-point results are rendered live on
    // LoopExecutionScreen during editing; the per-template calculation
    // result still persists via the shell service (used by the visit
    // aggregator on the Report screen). Persisting full per-point loop
    // detail across screen visits requires a structured-readings
    // evidence change deferred to a follow-up story.
    const executionShell = await readyState.executionShellService.saveGuidanceEvidence(
      readyState.session,
      readyState.executionShell,
    );
    const technicianReports = await loadCurrentTechnicianReports(readyState);

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            technicianReports,
            authMessage:
              'Teste de loop salvo localmente. Proximo: comparar historico, abrir checklist ou adicionar evidencia.',
          },
    );
  }

  async function handleAttachExecutionPhoto(
    source: 'camera' | 'library',
    contextNote?: string | null,
    options?: {
      technicianNote?: string | null;
      executionStepIdOverride?: SharedExecutionStepKind;
    },
  ) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    // Story 8.10 finding #4: when the user taps "Foto do instrumento" on
    // the detail screen and no template has been selected yet, auto-load
    // the first available template's shell silently so the photo still
    // attaches to the per-tag report. This decouples the instrument photo
    // from explicit template selection without changing the underlying
    // shell-per-template persistence model.
    let workingShell = readyState.executionShell;
    if (
      !workingShell &&
      options?.executionStepIdOverride === 'instrument' &&
      readyState.selectedTag &&
      readyState.selectedTagContext
    ) {
      const firstTemplateId =
        readyState.selectedTagContext.referencePointers.executionTemplates[0]?.id;
      if (firstTemplateId) {
        workingShell = await readyState.executionShellService.loadShell(
          readyState.session,
          readyState.selectedTag.workPackageId,
          readyState.selectedTag.tagId,
          firstTemplateId,
        );
      }
    }

    if (!workingShell || !isTechnicianEditableReportState(workingShell.report)) {
      return;
    }

    try {
      const photo =
        source === 'camera'
          ? await photoAcquisitionBoundary.capturePhoto()
          : await photoAcquisitionBoundary.selectPhoto();

      if (!photo) {
        return;
      }

      // Story 8.7 added `contextNote`; Story 8.8 adds optional
      // `technicianNote` and `executionStepIdOverride` (D-03 instrument-level
      // photos + D-04 technician comment). Pass through only the fields the
      // caller explicitly provided to keep the legacy two-arg call sites
      // unchanged.
      const attachOptions:
        | { contextNote?: string | null; technicianNote?: string | null; executionStepIdOverride?: SharedExecutionStepKind }
        | undefined =
        contextNote !== undefined || options?.technicianNote !== undefined || options?.executionStepIdOverride
          ? {
              ...(contextNote !== undefined ? { contextNote } : {}),
              ...(options?.technicianNote !== undefined ? { technicianNote: options.technicianNote } : {}),
              ...(options?.executionStepIdOverride
                ? { executionStepIdOverride: options.executionStepIdOverride }
                : {}),
            }
          : undefined;

      const executionShell = await readyState.executionShellService.attachPhotoEvidence(
        readyState.session,
        workingShell,
        photo,
        attachOptions,
      );
      const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
        readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
        readyState.syncStateService.listWorkPackageSyncSummaries(
          readyState.session,
          readyState.workPackages,
        ),
      ]);
      const technicianReports = await loadCurrentTechnicianReports(readyState);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionShell,
              // Story 8.10 QA Pass 4 patch: when the auto-load-shell branch
              // ran (instrument photo without prior template selection), the
              // executionShell is now populated but selectedExecutionTemplateId
              // was still null — making the detail screen's readiness tile
              // say "Selecione um teste" even though a shell is loaded. Keep
              // selectedExecutionTemplateId in sync with the loaded shell so
              // the UI signal is consistent.
              selectedExecutionTemplateId:
                current.selectedExecutionTemplateId ?? executionShell.template.id,
              reportSyncDetail,
              packageSyncSummaries,
              technicianReports,
              authMessage: `Foto salva localmente para ${executionShell.tagCode}.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao anexar a foto, sem mensagem detalhada.',
            },
      );
    }
  }

  async function handleRemoveExecutionPhoto(evidenceId: string) {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.removePhotoEvidence(
      readyState.session,
      readyState.executionShell,
      evidenceId,
    );
    const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
      readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
      readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        readyState.workPackages,
      ),
    ]);
    const technicianReports = await loadCurrentTechnicianReports(readyState);

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            reportSyncDetail,
            packageSyncSummaries,
            technicianReports,
            authMessage: `Foto removida localmente para ${executionShell.tagCode}.`,
          },
    );
  }

  // Story 8.8 D-04: update the technician's free-text observation on an
  // existing photo. Mirrors the photo attach/remove handler shape: mutate via
  // service, then refresh sync summaries and technician reports.
  async function handleUpdatePhotoTechnicianNote(
    evidenceId: string,
    note: string | null,
  ) {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.updatePhotoTechnicianNote(
      readyState.session,
      readyState.executionShell,
      evidenceId,
      note,
    );
    const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
      readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
      readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        readyState.workPackages,
      ),
    ]);
    const technicianReports = await loadCurrentTechnicianReports(readyState);

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            reportSyncDetail,
            packageSyncSummaries,
            technicianReports,
            authMessage: 'Observacao da foto atualizada localmente.',
          },
    );
  }

  async function handleSaveReportDraft() {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      !isTechnicianEditableReportState(readyState.executionShell.report)
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.saveReportDraft(
      readyState.session,
      readyState.executionShell,
    );
    const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
      readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
      readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        readyState.workPackages,
      ),
    ]);
    const technicianReports = await loadCurrentTechnicianReports(readyState);

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            reportSyncDetail,
            packageSyncSummaries,
            technicianReports,
            authMessage: `Rascunho do relatorio salvo localmente para ${executionShell.tagCode}.`,
          },
    );
  }

  async function handleStartQrScanner() {
    if (status.type !== 'ready') {
      return;
    }

    if (cameraPermission?.granted) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              qrScannerVisible: true,
              qrScanResult: null,
            },
      );
      return;
    }

    const requestedPermission = await requestCameraPermission();
    if (requestedPermission.granted) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              qrScannerVisible: true,
              qrScanResult: null,
            },
      );
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            qrScannerVisible: false,
            qrScanResult: {
              state: 'invalid',
              rawPayload: '',
              message: 'A permissao de camera e necessaria para escanear o QR da tag neste aparelho.',
              guidance:
                'Conceda acesso a camera ou cole o conteudo do QR abaixo para resolver localmente.',
            },
          },
    );
  }

  async function handleResolveQrPayload(rawPayload: string): Promise<LocalQrScanResult | null> {
    if (status.type !== 'ready' || !readyState.session) {
      return null;
    }

    const qrScanResult = await readyState.qrScanService.resolveScan(readyState.session, rawPayload);

    if (qrScanResult.state === 'hit') {
      const visibleTags = await readyState.localTagEntryService.listPackageTags(
        readyState.session,
        qrScanResult.tag.workPackageId,
      );
      const selectedTagContext = await readyState.localTagContextService.getTagContext(
        readyState.session,
        qrScanResult.tag.workPackageId,
        qrScanResult.tag.tagId,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              qrScannerVisible: false,
              qrManualPayload: '',
              qrScanResult,
              activeTagPackageId: qrScanResult.tag.workPackageId,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags,
              selectedTag: qrScanResult.tag,
              selectedTagContext,
              executionShell: null,
              authMessage: selectedTagContext
                ? qrScanResult.message
                : 'O contexto da tag selecionada nao esta disponivel no armazenamento local.',
            },
      );
      return qrScanResult;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            qrScannerVisible: false,
            qrScanResult,
            tagSearchQuery: '',
            ...preserveVisualCatalogAfterQrFailure(current),
            authMessage: null,
          },
    );

    return qrScanResult;
  }

  async function handleBarcodeScanned(event: BarcodeScanningResult) {
    if (status.type !== 'ready' || !readyState.qrScannerVisible) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            qrScannerVisible: false,
          },
    );

    await handleResolveQrPayload(event.data);
  }

  function handleQrPayloadChange(value: string) {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            qrManualPayload: value,
          },
    );
  }

  async function handleResolveManualQrPayload(): Promise<LocalQrScanResult | null> {
    if (status.type !== 'ready') {
      return null;
    }

    return handleResolveQrPayload(readyState.qrManualPayload);
  }

  function handleCancelQrScanner() {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            qrScannerVisible: false,
          },
    );
  }

  async function handleSwitchUser() {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            authBusy: true,
            authMessage: null,
          },
    );

    const result = await readyState.sessionController.clearForUserSwitch(
      readyState.session.connectionMode,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            session: result.state === 'cleared' ? null : current.session,
            localOwnership: result.state === 'cleared' ? null : current.localOwnership,
            authBusy: false,
            syncBusy: false,
            reviewBusy: result.state === 'cleared' ? false : current.reviewBusy,
            workPackages: result.state === 'cleared' ? [] : current.workPackages,
            packageSyncSummaries:
              result.state === 'cleared' ? {} : current.packageSyncSummaries,
            activeTagPackageId: result.state === 'cleared' ? null : current.activeTagPackageId,
            selectedExecutionTemplateId:
              result.state === 'cleared' ? null : current.selectedExecutionTemplateId,
            tagSearchQuery: result.state === 'cleared' ? '' : current.tagSearchQuery,
            visibleTags: result.state === 'cleared' ? [] : current.visibleTags,
            technicianReports:
              result.state === 'cleared' ? [] : current.technicianReports,
            selectedTag: result.state === 'cleared' ? null : current.selectedTag,
            selectedTagContext: result.state === 'cleared' ? null : current.selectedTagContext,
            executionShell: result.state === 'cleared' ? null : current.executionShell,
            reportSyncDetail: result.state === 'cleared' ? null : current.reportSyncDetail,
            supervisorReviewQueue:
              result.state === 'cleared' ? [] : current.supervisorReviewQueue,
            selectedSupervisorReviewReport:
              result.state === 'cleared' ? null : current.selectedSupervisorReviewReport,
            supervisorReturnComment:
              result.state === 'cleared' ? '' : current.supervisorReturnComment,
            supervisorEscalationRationale:
              result.state === 'cleared' ? '' : current.supervisorEscalationRationale,
            qrScannerVisible: result.state === 'cleared' ? false : current.qrScannerVisible,
            qrManualPayload: result.state === 'cleared' ? '' : current.qrManualPayload,
            qrScanResult: result.state === 'cleared' ? null : current.qrScanResult,
            authMessage:
              result.state === 'cleared'
                ? 'Sessao encerrada. O proximo usuario precisa entrar conectado ao servidor.'
                : result.message ?? 'Troca de usuario bloqueada.',
          },
      );
  }

  async function handleSubmitExecutionReport() {
      if (status.type !== 'ready' || !readyState.session || !readyState.executionShell) {
        return;
      }

      if (isManualInstrumentWorkPackageId(readyState.executionShell.workPackageId)) {
        try {
          const executionShell = await readyState.executionShellService.saveReportDraft(
            readyState.session,
            readyState.executionShell,
          );
          const technicianReports = await loadCurrentTechnicianReports(readyState);
          setStatus((current) =>
            current.type !== 'ready'
              ? current
              : {
                  ...current,
                  executionShell,
                  technicianReports,
                  authMessage:
                    'Relatorio manual salvo localmente. Envio ao backend depende de reconciliacao futura e nao foi simulado.',
                },
          );
        } catch (error) {
          setStatus((current) =>
            current.type !== 'ready'
              ? current
              : {
                  ...current,
                  authMessage:
                    error instanceof Error
                      ? error.message
                      : 'Falha ao salvar o rascunho do instrumento manual, sem mensagem detalhada.',
                },
          );
        }
        return;
      }

      // Submit-rule mismatch guard: the mobile shell never hard-blocks a
      // submission (Story 8.10), but the backend rejects any minimum
      // evidence reference that is not satisfied (422
      // 'minimum-evidence-missing'). Warn precisely what the server will
      // reject and let the technician proceed anyway.
      const missingMinimums = listUnsatisfiedMinimumEvidenceLabels(
        readyState.executionShell.report.evidenceReferences,
      );
      if (missingMinimums.length > 0) {
        Alert.alert(
          'Evidencia minima pendente',
          `O servidor exige e pode recusar este envio sem: ${missingMinimums.join(
            '; ',
          )}.\n\nEnviar mesmo assim?`,
          [
            { text: 'Voltar e completar', style: 'cancel' },
            {
              text: 'Enviar mesmo assim',
              onPress: () => void performSubmitExecutionReport(),
            },
          ],
        );
        return;
      }

      await performSubmitExecutionReport();
  }

  async function performSubmitExecutionReport() {
      if (status.type !== 'ready' || !readyState.session || !readyState.executionShell) {
        return;
      }

      try {
        // Story 8.14 finding #7: removed the Story 8.11 visit-summary
        // augmentation that injected a fenced block into the
        // observation notes. The user's "Observacoes do tecnico" field
        // is now reserved for free-form technician comments only; the
        // per-visit aggregate is surfaced through the structured
        // instrumentVisit projection on the Report screen's "Resumo da
        // visita" panel and (for AI/supervisor context) through the
        // submission DTO directly rather than via observation-note
        // string concatenation.
        let executionShell = await readyState.executionShellService.submitReport(
          readyState.session,
          readyState.executionShell,
        );
        let authMessage = `Relatorio de ${executionShell.tagCode} entrou na fila local de sincronizacao.`;

        if (readyState.session.connectionMode === 'connected') {
          try {
            await readyState.evidenceUploadOrchestrator.syncSubmittedReportEvidence(
              readyState.session,
              executionShell,
            );

            executionShell =
              (await readyState.executionShellService.loadShell(
                readyState.session,
                executionShell.workPackageId,
                executionShell.tagId,
                executionShell.template.id,
              )) ?? executionShell;
            // A fully-successful ONLINE submit must say the report reached
            // the server; the "entrou na fila local" copy is reserved for
            // the offline / queued path. Gate on the reloaded state so we
            // never overclaim while the submit queue item still exists.
            if (executionShell.report.state === 'submitted-pending-review') {
              authMessage =
                'Relatorio sincronizado com o servidor e enviado para revisao.';
            }
          } catch (error) {
            // Story 8.13 finding #11: detect token-expired and try a
            // silent refresh-and-retry once. The cached refresh token
            // is good for longer than the access token, so most 401s
            // resolve transparently. If the refresh fails the
            // technician sees a clear PT-BR message instead of the raw
            // "token expired" string from the backend.
            if (error instanceof EvidenceUploadApiError && error.statusCode === 401) {
              const refresh = await readyState.sessionController.restoreSession();
              const renewedSession =
                refresh.state === 'signed_in' &&
                refresh.session &&
                refresh.session.connectionMode === 'connected'
                  ? refresh.session
                  : null;
              if (renewedSession) {
                try {
                  await readyState.evidenceUploadOrchestrator.syncSubmittedReportEvidence(
                    renewedSession,
                    executionShell,
                  );
                  executionShell =
                    (await readyState.executionShellService.loadShell(
                      renewedSession,
                      executionShell.workPackageId,
                      executionShell.tagId,
                      executionShell.template.id,
                    )) ?? executionShell;
                  // Persist the renewed session into state so future
                  // calls in this submission flow (sync detail refresh,
                  // technician report list) use the fresh token.
                  setStatus((current) =>
                    current.type !== 'ready'
                      ? current
                      : { ...current, session: renewedSession },
                  );
                  authMessage =
                    'Sessao renovada automaticamente e relatorio sincronizado com sucesso.';
                } catch (retryError) {
                  authMessage =
                    retryError instanceof Error
                      ? `Relatorio ficou na fila local apos renovar a sessao: ${retryError.message}`
                      : 'Relatorio ficou na fila local apos renovar a sessao.';
                }
              } else {
                authMessage =
                  'Sua sessao expirou. Faca login novamente para concluir o envio. O relatorio permanece salvo localmente.';
              }
            } else {
              authMessage =
                error instanceof Error
                  ? `Relatorio ficou na fila local. Upload de evidencias encontrou problema e permanece no aparelho: ${error.message}`
                  : 'Relatorio ficou na fila local. Upload de evidencias encontrou problema e permanece no aparelho.';
            }
          }
        }
        const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
          readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
          readyState.syncStateService.listWorkPackageSyncSummaries(
            readyState.session,
            readyState.workPackages,
          ),
        ]);
        const technicianReports = await loadCurrentTechnicianReports(readyState);

        setStatus((current) =>
          current.type !== 'ready'
            ? current
            : {
                ...current,
                executionShell,
                reportSyncDetail,
                packageSyncSummaries,
                technicianReports,
                authMessage,
              },
        );
      } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Envio local do relatorio falhou sem mensagem detalhada.',
            },
      );
    }
  }

  async function handleRetryExecutionReportSync() {
    if (status.type !== 'ready' || !readyState.session || !readyState.executionShell) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            syncBusy: true,
            authMessage: null,
          },
    );

    try {
      const executionShell = await readyState.syncStateService.retryReportSync(
        readyState.session,
        readyState.executionShell,
      );
      const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
        readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
        readyState.syncStateService.listWorkPackageSyncSummaries(
          readyState.session,
          readyState.workPackages,
        ),
      ]);
      const technicianReports = await loadCurrentTechnicianReports(readyState);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              syncBusy: false,
              executionShell,
              reportSyncDetail,
              packageSyncSummaries,
              technicianReports,
              authMessage: `Tentativa de sincronizacao processada para ${executionShell.tagCode}.`,
            },
      );
    } catch (error) {
      const executionShell =
        (await readyState.executionShellService.loadShell(
          readyState.session,
          readyState.executionShell.workPackageId,
          readyState.executionShell.tagId,
          readyState.executionShell.template.id,
        )) ?? readyState.executionShell;
      const reportSyncDetail = await readyState.syncStateService.getReportSyncDetail(
        readyState.session,
        executionShell,
      );
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        readyState.workPackages,
      );
      const technicianReports = await loadCurrentTechnicianReports(readyState);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              syncBusy: false,
              executionShell,
              reportSyncDetail,
              packageSyncSummaries,
              technicianReports,
              authMessage:
                error instanceof Error
                  ? `Registros continuam na fila local: ${error.message}`
                  : 'Registros continuam na fila local.',
            },
      );
    }
  }

  async function handleRefreshExecutionReportServerStatus() {
    if (status.type !== 'ready' || !readyState.session || !readyState.executionShell) {
      return;
    }

    if (readyState.session.connectionMode !== 'connected') {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage: 'Reconecte antes de atualizar o status do relatorio no servidor.',
            },
      );
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            syncBusy: true,
            authMessage: null,
          },
    );

    try {
      // Story 8.9 D-01: refresh returns both the reloaded execution shell
      // AND the latest AI diagnosis projection from the same status fetch.
      // We map the backend projection into the mobile `VisualAiDiagnosis`
      // input shape and persist on the ready state so both projection sites
      // pick it up on the next render.
      const refreshed = await readyState.syncStateService.refreshReportServerStatus(
        readyState.session,
        readyState.executionShell,
      );
      const executionShell = refreshed.shell;
      const aiDiagnosisInput = mapAiDiagnosisProjection(refreshed.aiDiagnosis);
      const workPackages = await readyState.workPackageCatalog.loadLocalCatalog(
        readyState.session,
      );
      const [reportSyncDetail, packageSyncSummaries] = await Promise.all([
        readyState.syncStateService.getReportSyncDetail(readyState.session, executionShell),
        readyState.syncStateService.listWorkPackageSyncSummaries(
          readyState.session,
          workPackages,
        ),
      ]);
      const technicianReports = await loadTechnicianReportSummaries(
        readyState.runtime,
        readyState.session,
        await loadVisualShellTags(readyState.localTagEntryService, readyState.session, workPackages),
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              syncBusy: false,
              workPackages,
              executionShell,
              reportSyncDetail,
              packageSyncSummaries,
              technicianReports,
              executionAiDiagnosis: aiDiagnosisInput ?? current.executionAiDiagnosis,
              authMessage: `Status do servidor atualizado para ${executionShell.tagCode}.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              syncBusy: false,
              authMessage:
                error instanceof Error
                  ? `Falha ao atualizar o status no servidor: ${error.message}`
                  : 'Falha ao atualizar o status no servidor, sem mensagem detalhada.',
            },
      );
    }
  }

  // Keep the connectivity-regain effect's AI auto-poll pointing at the
  // freshest handler (see refreshServerStatusRef declaration above).
  refreshServerStatusRef.current = handleRefreshExecutionReportServerStatus;

  // Story 8.12 finding #2 follow-up: escape hatch from an invalidated
  // (supervisor-returned) report. Resets the per-tag draft to a fresh
  // technician-owned state through the service and reloads the shell so
  // the technician can execute a new visit and resubmit for the same tag.
  async function handleStartNewVisit() {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell?.report.invalidated
    ) {
      return;
    }

    try {
      const executionShell = await readyState.executionShellService.startNewVisit(
        readyState.session,
        readyState.executionShell,
      );
      const reportSyncDetail = await readyState.syncStateService.getReportSyncDetail(
        readyState.session,
        executionShell,
      );
      const technicianReports = await loadCurrentTechnicianReports(readyState);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionShell,
              reportSyncDetail,
              technicianReports,
              authMessage: `Nova visita iniciada para ${executionShell.tagCode}. Registre as correcoes e reenvie o relatorio.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof Error
                  ? `Falha ao iniciar nova visita: ${error.message}`
                  : 'Falha ao iniciar nova visita.',
            },
      );
    }
  }

  // Story 8.9 D-01: manual AI diagnosis request from the technician's report
  // screen. The backend enqueues a worker job and returns the current AI
  // state (typically 'pending'); the technician immediately sees "Em
  // processamento" on the report. AI is assistive — errors here MUST NOT
  // halt the report itself. We catch broadly and surface a non-blocking
  // PT-BR message.
  async function handleRequestExecutionAiDiagnosis() {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      readyState.session.connectionMode !== 'connected'
    ) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage: 'Reconecte para solicitar diagnostico assistido.',
            },
      );
      return;
    }
    try {
      const response = await readyState.evidenceUploadOrchestrator.requestAiDiagnosis(
        readyState.session,
        readyState.executionShell.report.reportId,
      );
      const aiDiagnosisInput = mapAiDiagnosisProjection(response.aiDiagnosis);
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionAiDiagnosis: aiDiagnosisInput ?? current.executionAiDiagnosis,
              authMessage:
                aiDiagnosisInput?.state === 'pending'
                  ? 'Diagnostico assistido em processamento. Atualize o status para ver o resultado.'
                  : aiDiagnosisInput?.state === 'available'
                    ? 'Diagnostico assistido disponivel neste relatorio.'
                    : 'Diagnostico assistido solicitado. Verifique novamente em instantes.',
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof Error
                  ? `Diagnostico assistido nao disponivel agora: ${error.message}`
                  : 'Diagnostico assistido nao disponivel agora. O relatorio nao foi afetado.',
            },
      );
    }
  }

  // Returns true on success (see handleRefreshAssignedPackages) so the
  // one-tap sync flow can report failures honestly.
  async function handleRefreshSupervisorReviewQueue(
    sessionOverride?: ActiveUserSession,
  ): Promise<boolean> {
    if (status.type !== 'ready') {
      return false;
    }
    const session = sessionOverride ?? readyState.session;
    if (!session) {
      return false;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            reviewBusy: true,
            authMessage: null,
          },
    );

    try {
      const isManagerReview = session.role === 'manager';
      const supervisorReviewQueue = isManagerReview
        ? await readyState.supervisorReviewService.refreshManagerQueue(session)
        : await readyState.supervisorReviewService.refreshQueue(session);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              supervisorReviewQueue,
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              authMessage: `${supervisorReviewQueue.length} relatorio(s) de revisao carregado(s).`,
            },
      );
      return true;
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao carregar a fila de revisao.',
            },
      );
      return false;
    }
  }

  async function handleOpenSupervisorReviewReport(reportId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            reviewBusy: true,
            authMessage: null,
          },
    );

    try {
      const selectedSupervisorReviewReport =
        readyState.session.role === 'manager'
          ? await readyState.supervisorReviewService.loadManagerReportDetail(
              readyState.session,
              reportId,
            )
          : await readyState.supervisorReviewService.loadReportDetail(
              readyState.session,
              reportId,
            );

      // Story 8.9 D-01: the supervisor review detail response now carries
      // an `aiDiagnosis` projection. Map it into the mobile shape so the
      // supervisor screen renders the assistive state alongside the
      // technician's report.
      const supervisorAiDiagnosisInput = mapAiDiagnosisProjection(
        selectedSupervisorReviewReport?.aiDiagnosis ?? null,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              selectedSupervisorReviewReport,
              supervisorAiDiagnosis: supervisorAiDiagnosisInput,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              authMessage: `Detalhe de revisao carregado para ${selectedSupervisorReviewReport.tagId}.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao abrir o detalhe do relatorio em revisao, sem mensagem detalhada.',
            },
      );
    }
  }

  function handleCloseSupervisorReviewReport() {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
            supervisorReturnComment: '',
            supervisorEscalationRationale: '',
          },
    );
  }

  function handleSupervisorReturnCommentChange(value: string) {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            supervisorReturnComment: value,
          },
    );
  }

  function handleSupervisorEscalationRationaleChange(value: string) {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            supervisorEscalationRationale: value,
          },
    );
  }

  async function handleApproveSupervisorReviewReport(reportId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            reviewBusy: true,
            authMessage: null,
          },
    );

    try {
      const isManagerReview = readyState.session.role === 'manager';
      const decision = isManagerReview
        ? await readyState.supervisorReviewService.approveManagerReport(
            readyState.session,
            reportId,
          )
        : await readyState.supervisorReviewService.approveReport(
            readyState.session,
            reportId,
          );
      const supervisorReviewQueue = isManagerReview
        ? await readyState.supervisorReviewService.refreshManagerQueue(readyState.session)
        : await readyState.supervisorReviewService.refreshQueue(readyState.session);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              supervisorReviewQueue,
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              authMessage: `Relatorio ${decision.reportId} aprovado e registrado na trilha de auditoria.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao aprovar o relatorio, sem mensagem detalhada.',
            },
      );
    }
  }

  async function handleReturnSupervisorReviewReport(reportId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            reviewBusy: true,
            authMessage: null,
          },
    );

    try {
      const isManagerReview = readyState.session.role === 'manager';
      const decision = isManagerReview
        ? await readyState.supervisorReviewService.returnManagerReport(
            readyState.session,
            reportId,
            readyState.supervisorReturnComment,
          )
        : await readyState.supervisorReviewService.returnReport(
            readyState.session,
            reportId,
            readyState.supervisorReturnComment,
          );
      const supervisorReviewQueue = isManagerReview
        ? await readyState.supervisorReviewService.refreshManagerQueue(readyState.session)
        : await readyState.supervisorReviewService.refreshQueue(readyState.session);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              supervisorReviewQueue,
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              authMessage: `Relatorio ${decision.reportId} devolvido ao tecnico com comentario.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao devolver o relatorio, sem mensagem detalhada.',
            },
      );
    }
  }

  async function handleEscalateSupervisorReviewReport(reportId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            reviewBusy: true,
            authMessage: null,
          },
    );

    try {
      const decision = await readyState.supervisorReviewService.escalateReport(
        readyState.session,
        reportId,
        readyState.supervisorEscalationRationale,
      );
      const supervisorReviewQueue =
        await readyState.supervisorReviewService.refreshQueue(readyState.session);

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              supervisorReviewQueue,
              selectedSupervisorReviewReport: null,
          executionAiDiagnosis: null,
          supervisorAiDiagnosis: null,
              supervisorReturnComment: '',
              supervisorEscalationRationale: '',
              authMessage: `Relatorio ${decision.reportId} escalonado para gerente.`,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              reviewBusy: false,
              authMessage:
                error instanceof Error
                  ? error.message
                  : 'Falha ao escalonar o relatorio, sem mensagem detalhada.',
            },
      );
    }
  }

  return (
    <>
    <VisualProductShell
      apiBaseUrl={readyState.apiBaseUrl}
      networkOnline={isOnline}
      packageSyncSummaries={readyState.packageSyncSummaries}
      onClearAuthMessage={() =>
        setStatus((current) =>
          current.type !== 'ready' || current.authMessage === null
            ? current
            : { ...current, authMessage: null },
        )
      }
      authBusy={readyState.authBusy}
      authMessage={readyState.authMessage}
      email={email}
      packageBusy={readyState.packageBusy}
      password={password}
      qrManualPayload={readyState.qrManualPayload}
      qrScanResult={readyState.qrScanResult}
      qrScannerVisible={readyState.qrScannerVisible}
      reportSyncDetail={readyState.reportSyncDetail}
      reviewBusy={readyState.reviewBusy}
      selectedExecutionTemplateId={readyState.selectedExecutionTemplateId}
      executionShell={readyState.executionShell}
      executionTemplateStatuses={readyState.executionTemplateStatuses}
      instrumentVisit={readyState.instrumentVisit}
      executionAiDiagnosis={readyState.executionAiDiagnosis}
      supervisorAiDiagnosis={readyState.supervisorAiDiagnosis}
      selectedSupervisorReviewReport={readyState.selectedSupervisorReviewReport}
      selectedTag={readyState.selectedTag}
      selectedTagContext={readyState.selectedTagContext}
      session={readyState.session}
      technicianReports={readyState.technicianReports}
      supervisorEscalationRationale={readyState.supervisorEscalationRationale}
      supervisorReturnComment={readyState.supervisorReturnComment}
      supervisorReviewQueue={readyState.supervisorReviewQueue}
      syncBusy={readyState.syncBusy}
      visibleTags={readyState.visibleTags}
      workPackages={readyState.workPackages}
      onApproveSupervisorReviewReport={(reportId) =>
        handleApproveSupervisorReviewReport(reportId)
      }
      onAttachReportPhoto={(source, contextNote, options) =>
        handleAttachExecutionPhoto(source, contextNote, options)
      }
      onUpdatePhotoTechnicianNote={(evidenceId, note) =>
        handleUpdatePhotoTechnicianNote(evidenceId, note)
      }
      onBarcodeScanned={(event) => void handleBarcodeScanned(event)}
      onBrowsePackageTags={(workPackageId) => handleBrowsePackageTags(workPackageId)}
      onCancelQrScanner={handleCancelQrScanner}
      onCalculationInputChange={handleExecutionCalculationInputChange}
      onChecklistOutcomeChange={handleChecklistOutcomeChange}
      onCloseSupervisorReviewReport={handleCloseSupervisorReviewReport}
      onCreateManualInstrument={(input) => handleCreateManualInstrument(input)}
      onDownloadPackage={(workPackageId) => handleDownloadAssignedPackage(workPackageId)}
      onDeleteLocalPackage={(workPackageId) => handleDeleteLocalPackage(workPackageId)}
      onEmailChange={setEmail}
      onEscalateSupervisorReviewReport={(reportId) =>
        handleEscalateSupervisorReviewReport(reportId)
      }
      onOpenTechnicianReport={(report) => handleOpenTechnicianReport(report)}
      onOpenTag={(identity) => handleOpenVisualTag(identity)}
      onOpenExecutionTemplate={(templateId) => handleOpenExecutionTemplate(templateId)}
      onOpenSupervisorReviewReport={(reportId) => handleOpenSupervisorReviewReport(reportId)}
      onPasswordChange={setPassword}
      onProceedToExecutionShell={() => handleProceedToExecutionShell()}
      onQrManualPayloadChange={handleQrPayloadChange}
      onRefreshPackages={() => void handleRefreshAssignedPackages()}
      onSyncWithServer={() => void handleSyncWithServer()}
      onRefreshReportServerStatus={() => handleRefreshExecutionReportServerStatus()}
      onRequestExecutionAiDiagnosis={() => handleRequestExecutionAiDiagnosis()}
      onRefreshSupervisorReviewQueue={async () => {
        await handleRefreshSupervisorReviewQueue();
      }}
      onRemoveReportPhoto={(evidenceId) => handleRemoveExecutionPhoto(evidenceId)}
      onReportReviewNotesChange={handleReportReviewNotesChange}
      onResolveQrManualPayload={() => handleResolveManualQrPayload()}
      onReturnSupervisorReviewReport={(reportId) => handleReturnSupervisorReviewReport(reportId)}
      onObservationNotesChange={handleObservationNotesChange}
      onRiskJustificationChange={handleRiskJustificationChange}
      onSaveCalculation={() => handleSaveExecutionCalculation()}
      onSaveGuidanceEvidence={() => handleSaveExecutionEvidence()}
      onSaveLoopTestNote={(note) => handleSaveLoopTestNote(note)}
      onSaveLoopTestEvidence={(input) => handleSaveLoopTestEvidence(input)}
      onSaveReportDraft={() => handleSaveReportDraft()}
      onSelectExecutionTemplate={handleSelectExecutionTemplate}
      onSaveApiBaseUrl={(url) => handleSaveApiBaseUrl(url)}
      onSignIn={() => void handleSignIn()}
      onStartQrScanner={() => void handleStartQrScanner()}
      onSupervisorEscalationRationaleChange={handleSupervisorEscalationRationaleChange}
      onSupervisorReturnCommentChange={handleSupervisorReturnCommentChange}
      onStartNewVisit={() => void handleStartNewVisit()}
      onSubmitReport={() => handleSubmitExecutionReport()}
      onRetryReportSync={() => handleRetryExecutionReportSync()}
      onSwitchUser={() => void handleSwitchUser()}
      onOpenSupervisorAuthoring={() => setSupervisorAuthoringVisible(true)}
    />
    {supervisorAuthoringVisible && readyState.session ? (
      <SupervisorAuthoringScreen
        service={readyState.supervisorAuthoringService}
        session={readyState.session}
        onClose={() => setSupervisorAuthoringVisible(false)}
        onCreated={(result) => {
          setSupervisorAuthoringVisible(false);
          setStatus((current) =>
            current.type !== 'ready'
              ? current
              : {
                  ...current,
                  authMessage: `Pacote criado: ${result.title} (${result.tagCount} instrumento(s)).`,
                },
          );
        }}
      />
    ) : null}
    </>
  );
}

// Story 8.9 D-01: map the backend's `ReportSubmissionAiDiagnosisProjection`
// into the mobile `VisualAiDiagnosisProjectionInput` shape. The fields align
// 1:1; this helper just narrows the optionality and drops backend-only
// fields the projection doesn't need.
function mapAiDiagnosisProjection(
  projection: ReportSubmissionAiDiagnosisProjection | null | undefined,
): VisualAiDiagnosisProjectionInput | null {
  if (!projection) return null;
  return {
    state: projection.state,
    summary: projection.summary,
    detail: projection.detail,
    providerLabel: projection.providerLabel,
    generatedAt: projection.generatedAt,
    // Story 8.12 finding #5: forward the provider failure reason so
    // the visual projection can render it explicitly when the AI
    // request failed (instead of a generic "Nao foi possivel..." line).
    failureReason: projection.failureReason ?? null,
  };
}

async function loadVisualShellTags(
  localTagEntryService: LocalTagEntryService,
  session: ActiveUserSession,
  workPackages: LocalAssignedWorkPackageSummary[],
): Promise<LocalAssignedTagEntry[]> {
  const downloadedPackages = workPackages.filter((workPackage) => workPackage.hasSnapshot);
  const tagGroups = await Promise.all(
    downloadedPackages.map(async (workPackage) => {
      try {
        return await localTagEntryService.listPackageTags(session, workPackage.id);
      } catch {
        return [];
      }
    }),
  );

  return tagGroups.flat();
}

async function loadTechnicianReportSummaries(
  runtime: LocalRuntime,
  session: ActiveUserSession,
  tags: LocalAssignedTagEntry[],
): Promise<VisualTechnicianReportSummary[]> {
  const drafts = await runtime.repositories.userPartitions
    .forUser(session.userId)
    .drafts.listDrafts();
  const records = drafts
    .map(parseTechnicianReportRecord)
    .filter((record): record is VisualTechnicianReportRecord => record !== null);

  return buildTechnicianReportSummaries({ records, tags });
}

function parseTechnicianReportRecord(draft: UserOwnedDraftRecord): VisualTechnicianReportRecord | null {
  if (draft.businessObjectType !== LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE) {
    return null;
  }

  try {
    const parsed = JSON.parse(draft.payloadJson) as Partial<VisualTechnicianReportRecord> & {
      state?: unknown;
    };
    if (
      typeof parsed.reportId !== 'string' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
      typeof parsed.templateId !== 'string' ||
      typeof parsed.templateVersion !== 'string' ||
      !isSharedExecutionReportState(parsed.reportState ?? parsed.state) ||
      !isSharedExecutionLifecycleState(parsed.lifecycleState) ||
      !isSharedExecutionSyncState(parsed.syncState) ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }

    const reportState = parsed.reportState ?? parsed.state;
    if (!isSharedExecutionReportState(reportState)) {
      return null;
    }

    return {
      reportId: parsed.reportId,
      workPackageId: parsed.workPackageId,
      tagId: parsed.tagId,
      templateId: parsed.templateId,
      templateVersion: parsed.templateVersion,
      packageVersion:
        typeof parsed.packageVersion === 'number' ? parsed.packageVersion : null,
      reportState,
      lifecycleState: parsed.lifecycleState,
      syncState: parsed.syncState,
      reviewNotes: typeof parsed.reviewNotes === 'string' ? parsed.reviewNotes : '',
      updatedAt: parsed.updatedAt,
      submittedAt: typeof parsed.submittedAt === 'string' ? parsed.submittedAt : null,
      syncIssue: typeof parsed.syncIssue === 'string' ? parsed.syncIssue : null,
    };
  } catch {
    return null;
  }
}

function isSharedExecutionReportState(value: unknown): value is SharedExecutionReportState {
  return (
    value === 'technician-owned-draft' ||
    value === 'submitted-pending-sync' ||
    value === 'submitted-pending-review'
  );
}

function isTechnicianEditableReportState(
  report: { state: SharedExecutionReportState; invalidated?: boolean },
): boolean {
  // Story 8.12 finding #2: a supervisor-returned draft is marked
  // `invalidated: true`. Even though its server state is still
  // technically a technician-owned-draft (since the supervisor sent it
  // back), the technician must NOT keep editing it - they have to start
  // a fresh visit, and the invalidated row stays as read-only history.
  if (report.invalidated) {
    return false;
  }
  return report.state === 'technician-owned-draft' || report.state === 'submitted-pending-sync';
}

function isSharedExecutionLifecycleState(
  value: unknown,
): value is SharedExecutionReportLifecycleState {
  return (
    value === 'In Progress' ||
    value === 'Ready to Submit' ||
    value === 'Submitted - Pending Sync' ||
    value === 'Submitted - Pending Supervisor Review' ||
    value === 'Escalated - Pending Manager Review' ||
    value === 'Returned by Supervisor' ||
    value === 'Returned by Manager' ||
    value === 'Approved'
  );
}

function isSharedExecutionSyncState(value: unknown): value is SharedExecutionSyncState {
  return (
    value === 'local-only' ||
    value === 'queued' ||
    value === 'syncing' ||
    value === 'pending-validation' ||
    value === 'synced' ||
    value === 'sync-issue'
  );
}

async function flushMobileDiagnosticsSafely(
  reporter: MobileDiagnosticsReporter,
  session: ActiveUserSession | null,
) {
  try {
    return await reporter.flushUnreportedErrors(session);
  } catch {
    return {
      attempted: 0,
      succeeded: 0,
      failed: 0,
    };
  }
}

function buildRetrySummaryMessage(summary: {
  attempted: number;
  succeeded: number;
  failed: number;
}) {
  return `Nova tentativa de sync verificou ${summary.attempted} relatorio(s) na fila: ${summary.succeeded} enviado(s), ${summary.failed} mantido(s) na fila.`;
}
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f4',
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#991b1b',
  },
  stateBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
    textAlign: 'center',
  },
});
