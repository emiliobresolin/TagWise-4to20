import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { bootstrapLocalDatabase, type LocalRuntime } from '../data/local/bootstrapLocalDatabase';
import type { UserOwnedDraftRecord } from '../data/local/repositories/userPartitionedLocalTypes';
import {
  DEFAULT_SHELL_ROUTE,
  type BootstrapDemoRecord,
  type DatabaseMigrationSummary,
  type LocalOwnershipProofSnapshot,
  type MobileDiagnosticsSnapshot,
  type ShellRoute,
} from '../features/app-shell/model';
import {
  loadLocalOwnershipProof,
  writeLocalOwnershipProof,
} from '../features/app-shell/localOwnershipDemo';
import { createFetchAuthApiClient, getDefaultAuthApiBaseUrl } from '../features/auth/authApiClient';
import { SessionController } from '../features/auth/sessionController';
import type { ActiveUserSession } from '../features/auth/model';
import { MobileErrorCaptureService } from '../features/diagnostics/mobileErrorCapture';
import { createFetchMobileDiagnosticsApiClient } from '../features/diagnostics/mobileDiagnosticsApiClient';
import { MobileDiagnosticsReporter } from '../features/diagnostics/mobileDiagnosticsReporter';
import { DeterministicCalculationInputError } from '../features/execution/deterministicCalculationEngine';
import {
  canProceedToExecutionShell,
  resolveExplicitExecutionTemplateSelection,
} from '../features/execution/executionTemplateSelection';
import {
  SharedExecutionShellService,
  type InstrumentVisitView,
  type SharedExecutionTemplateStatus,
} from '../features/execution/sharedExecutionShellService';
import type {
  SharedExecutionChecklistItem,
  SharedExecutionChecklistOutcome,
  SharedExecutionField,
  SharedExecutionGuidanceItem,
  SharedExecutionLinkedGuidanceSnippet,
  SharedExecutionLoopReadingPoint,
  SharedExecutionPhotoAttachment,
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
import {
  evaluateAssignedWorkPackageReadiness,
  formatAssignedWorkPackageFreshness,
} from '../features/work-packages/assignedWorkPackageReadiness';
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
import {
  buildSyncStateBadgeModel,
  formatSyncStateLabel,
  type SyncStateTone,
} from '../features/sync/syncStateModel';
import { LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE } from '../features/sync/queueContracts';
import {
  SyncStateService,
  type ReportSyncDetail,
  type WorkPackageSyncSummary,
} from '../features/sync/syncStateService';
import { detectConnectivityRegain } from '../features/sync/syncConnectivityRegain';
import { createEvidenceBinaryUploadBoundary } from '../platform/files/evidenceBinaryUploadBoundary';
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
import { closeRuntimeIfInactive } from './runtimeCleanup';
import { VisualProductShell } from './VisualProductShell';

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

const placeholderRoutes = [
  { key: 'foundation' as const, label: 'Foundation' },
  { key: 'packages' as const, label: 'Packages' },
  { key: 'review' as const, label: 'Review' },
  { key: 'storage' as const, label: 'Storage' },
];

export function TagWiseApp() {
  const [status, setStatus] = useState<BootstrapStatus>({ type: 'loading' });
  const [email, setEmail] = useState('tech@tagwise.local');
  const [password, setPassword] = useState('TagWise123!');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  // Story 9.4: supervisor authoring overlay visibility. Kept as a separate
  // top-level state instead of threading through readyState because the
  // screen is a self-contained modal flow that only depends on the
  // supervisor session + the authoring service.
  const [supervisorAuthoringVisible, setSupervisorAuthoringVisible] = useState(false);

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

        const secureStorage = createSecureStorageBoundary();
        const sessionController = new SessionController({
          apiClient: createFetchAuthApiClient(),
          secureStorage,
          authSessionCache: runtime.repositories.authSessionCache,
          localWorkState: runtime.repositories.localWorkState,
        });
        const errorCapture = new MobileErrorCaptureService(runtime.repositories.mobileRuntimeErrors);
        const mobileDiagnosticsReporter = new MobileDiagnosticsReporter(
          runtime.repositories.mobileRuntimeErrors,
          createFetchMobileDiagnosticsApiClient({
            baseUrl: getDefaultAuthApiBaseUrl(),
            secureStorage,
          }),
        );
        const workPackageCatalog = new AssignedWorkPackageCatalogService({
          apiClient: createFetchAssignedWorkPackageApiClient({
            baseUrl: getDefaultAuthApiBaseUrl(),
            secureStorage,
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
          baseUrl: getDefaultAuthApiBaseUrl(),
          secureStorage,
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
            baseUrl: getDefaultAuthApiBaseUrl(),
            secureStorage,
          }),
          // Story 10.2 (issue #4): pass the evidence client so loadReportDetail
          // can fetch pre-signed download URLs for the technician's photos
          // and the supervisor can SEE them in the review detail screen.
          evidenceUploadApiClient,
        );
        const supervisorAuthoringService = new SupervisorAuthoringService(
          createFetchSupervisorAuthoringApiClient({
            baseUrl: getDefaultAuthApiBaseUrl(),
            secureStorage,
          }),
        );
        const manualInstrumentService = new ManualInstrumentService({
          userPartitions: runtime.repositories.userPartitions,
        });
        const qrScanService = new LocalQrScanService({
          userPartitions: runtime.repositories.userPartitions,
        });
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

        setStatus({
          type: 'ready',
          runtime,
          route: runtime.snapshot.shellRoute,
          demoRecord: runtime.snapshot.demoRecord,
          diagnostics,
          workPackages,
          migrationSummary: runtime.snapshot.migrationSummary,
          databaseName: runtime.snapshot.databaseName,
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
            diagnosticReportSummary.succeeded > 0
              ? `Reported ${diagnosticReportSummary.succeeded} mobile diagnostic event(s).`
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
  }, []);

  // Story 8.8 D-06: wire `detectConnectivityRegain` into the production app
  // path. When the app comes back to foreground while the cached session is
  // 'offline', try to restore the session against the auth API. If that
  // succeeds with connectionMode 'connected', retry eligible queued reports
  // and update the visible session. Bounded: at most one regain attempt per
  // 30 seconds so a foreground/background toggle storm cannot flood the API.
  const regainBusyRef = useRef(false);
  const lastRegainAttemptAtRef = useRef(0);
  useEffect(() => {
    if (status.type !== 'ready' || !status.session) {
      return;
    }
    if (status.session.connectionMode === 'connected') {
      // Already connected; nothing to regain. The handler still registers so
      // that a future drop-and-recover within this session can be picked up
      // when the foregrounded session has flipped to 'offline'.
    }

    const currentSession = status.session;
    const sessionController = status.sessionController;
    const syncStateService = status.syncStateService;

    async function handleForeground(nextState: AppStateStatus) {
      if (nextState !== 'active') return;
      if (regainBusyRef.current) return;
      const now = Date.now();
      if (now - lastRegainAttemptAtRef.current < 30_000) return;
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
          return;
        }

        setStatus((current) => {
          if (current.type !== 'ready') return current;
          const summary = result.retrySummary;
          const summaryMessage =
            summary.attempted === 0
              ? 'Conexao restaurada. Nada na fila local para sincronizar.'
              : `Conexao restaurada. Sincronizados ${summary.succeeded} de ${summary.attempted} itens da fila local.`;
          return {
            ...current,
            session: result.session,
            authMessage: summaryMessage,
          };
        });
      } finally {
        regainBusyRef.current = false;
      }
    }

    const subscription = AppState.addEventListener('change', handleForeground);
    return () => {
      subscription.remove();
    };
  }, [status]);

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

  async function handleRouteChange(route: ShellRoute) {
    if (route === readyState.route) {
      return;
    }

    await readyState.runtime.repositories.appPreferences.setShellRoute(route);

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            route,
          },
    );
  }

  async function handleManualWrite() {
    const demoRecord = await readyState.runtime.repositories.bootstrapDemo.recordManualWrite();

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            demoRecord,
          },
    );
  }

  async function handleWriteLocalOwnershipProof() {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    const localOwnership = await writeLocalOwnershipProof(readyState.runtime, readyState.session);

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            localOwnership,
            authMessage: 'Rascunho local, metadata de evidencia, fila e arquivo sandbox atualizados.',
          },
    );
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
        authMessage = `${authMessage} Assigned packages could not be refreshed: ${
          packageError instanceof Error ? packageError.message : 'Unknown package refresh error.'
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
        authMessage = `${authMessage} Reported ${diagnosticReportSummary.succeeded} mobile diagnostic event(s).`;
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

  async function handleRefreshAssignedPackages() {
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
      // Story 10.1: before fetching the new catalog, pull down the latest
      // server-side lifecycle for every in-flight report so any supervisor
      // approvals / returns / escalations the technician hasn't seen yet
      // are reflected in both the rollup status (Em revisao -> Atencao /
      // Concluido) and the per-template state on tap-in.
      await readyState.syncStateService.refreshInflightReportStatuses(readyState.session);
      const workPackages = await readyState.workPackageCatalog.refreshConnectedCatalog(
        readyState.session,
      );
      const packageSyncSummaries = await readyState.syncStateService.listWorkPackageSyncSummaries(
        readyState.session,
        workPackages,
      );
      const visibleTags = await loadVisualShellTags(
        readyState.localTagEntryService,
        readyState.session,
        workPackages,
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
    }
  }

  // Story 10.7 (follow-up to issue #5): one-tap "Sincronizar com servidor"
  // affordance on the dashboard. Pulls everything that could be stale in a
  // single action so the technician / supervisor does not have to remember
  // which sub-screen has the refresh button.
  //
  // For all roles: refresh the package catalog + every in-flight report's
  // server lifecycle (so supervisor decisions land instantly).
  // For supervisor / manager: also refresh the review queue.
  async function handleSyncWithServer() {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }
    if (readyState.session.connectionMode !== 'connected') {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage: 'Reconecte antes de sincronizar com o servidor.',
            },
      );
      return;
    }
    await handleRefreshAssignedPackages();
    if (
      readyState.session.role === 'supervisor' ||
      readyState.session.role === 'manager'
    ) {
      await handleRefreshSupervisorReviewQueue();
    }
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            authMessage: 'Sincronizacao com o servidor concluida.',
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
              authMessage: `Assigned package ${result.snapshot.summary.id} snapshot stored locally with ${visibleTags.length} cached tag(s).`,
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
                  : 'Assigned package download failed without a detailed message.',
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
                ? `Loaded ${visibleTags.length} cached tag(s) from package ${workPackageId}.`
                : `No cached tags are available in package ${workPackageId}. Download the snapshot first.`,
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
                  : 'Manual instrument creation failed without a detailed message.',
            },
      );
      return false;
    }
  }

  async function handleTagSearchChange(query: string) {
    if (status.type !== 'ready' || !readyState.session || !readyState.activeTagPackageId) {
      return;
    }

    const visibleTags = await readyState.localTagEntryService.searchPackageTags(
      readyState.session,
      readyState.activeTagPackageId,
      query,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            tagSearchQuery: query,
            visibleTags,
            selectedTag:
              current.selectedTag && visibleTags.some((tag) => tag.tagId === current.selectedTag?.tagId)
                ? current.selectedTag
                : null,
            selectedTagContext:
              current.selectedTagContext &&
              visibleTags.some((tag) => tag.tagId === current.selectedTagContext?.tagId)
                ? current.selectedTagContext
                : null,
            selectedExecutionTemplateId:
              current.selectedTagContext &&
              visibleTags.some((tag) => tag.tagId === current.selectedTagContext?.tagId)
                ? current.selectedExecutionTemplateId
                : null,
            executionShell:
              current.executionShell &&
              visibleTags.some((tag) => tag.tagId === current.executionShell?.tagId)
                ? current.executionShell
                : null,
          },
    );
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
              ? `Tag context loaded locally for ${entry.tagCode}.`
              : 'Selected tag context is not available in local storage.',
            },
    );

    return true;
  }

  async function handleOpenTag(tagId: string): Promise<boolean> {
    if (status.type !== 'ready' || !readyState.session || !readyState.activeTagPackageId) {
      return false;
    }

    const selectedTag = await readyState.localTagEntryService.selectPackageTag(
      readyState.session,
      readyState.activeTagPackageId,
      tagId,
    );

    if (!selectedTag) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
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

  function handleReturnToTagContext() {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell: null,
          },
    );
  }

  async function handleOpenExecutionStep(stepId: string) {
    if (status.type !== 'ready' || !readyState.session || !readyState.executionShell) {
      return;
    }

    const executionShell = await readyState.executionShellService.selectStep(
      readyState.session,
      readyState.executionShell,
      stepId,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
          },
    );
  }

  async function handleMoveExecutionStep(direction: 'previous' | 'next') {
    if (status.type !== 'ready' || !readyState.executionShell) {
      return;
    }

    const currentIndex = readyState.executionShell.steps.findIndex(
      (step) => step.id === readyState.executionShell?.progress.currentStepId,
    );

    if (currentIndex < 0) {
      return;
    }

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    const nextStep = readyState.executionShell.steps[nextIndex];
    if (!nextStep) {
      return;
    }

    await handleOpenExecutionStep(nextStep.id);
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
    setStatus((current) =>
      current.type !== 'ready' ||
      !current.executionShell ||
      !isTechnicianEditableReportState(current.executionShell.report)
        ? current
        : {
            ...current,
            executionShell: current.executionShellService.updateChecklistOutcome(
              current.executionShell,
              checklistItemId,
              outcome,
            ),
          },
    );
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
                  : 'Deterministic calculation failed without a detailed message.',
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
                  : 'Photo attachment failed without a detailed message.',
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
              message: 'Camera permission is required to scan a tag QR code on this device.',
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
                : 'Selected tag context is not available in local storage.',
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

  function handleCloseTagBrowser() {
    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            activeTagPackageId: null,
            selectedExecutionTemplateId: null,
            tagSearchQuery: '',
            visibleTags: [],
            selectedTag: null,
            selectedTagContext: null,
            executionShell: null,
            qrScanResult: null,
          },
    );
  }

  async function handleCaptureDiagnosticError() {
    if (status.type !== 'ready') {
      return;
    }

    try {
      const captured = await readyState.errorCapture.captureError(
        new Error('Forced mobile diagnostics capture'),
        {
          session: readyState.session
            ? {
                userId: readyState.session.userId,
                role: readyState.session.role,
                connectionMode: readyState.session.connectionMode,
              }
            : null,
          shellRoute: readyState.route,
          apiBaseUrl: getDefaultAuthApiBaseUrl(),
          context: {
            source: 'story-1.5-shell-proof',
            databaseName: readyState.databaseName,
          },
        },
      );
      const diagnostics = await readyState.errorCapture.getSnapshot();
      const diagnosticReportSummary = await flushMobileDiagnosticsSafely(
        readyState.mobileDiagnosticsReporter,
        readyState.session,
      );
      const diagnosticMessage =
        diagnosticReportSummary.succeeded > 0
          ? `Captured and reported diagnostic event ${captured.id}.`
          : `Captured local diagnostic event ${captured.id}.`;

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              diagnostics,
              authMessage: diagnosticMessage,
            },
      );
    } catch (error) {
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              authMessage:
                error instanceof Error ? error.message : 'Mobile diagnostics capture failed.',
            },
      );
    }
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
                ? 'Session cleared. Connected sign-in is required for the next user.'
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
                      : 'Manual instrument draft save failed without a detailed message.',
                },
          );
        }
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
                  ? `Server status refresh failed: ${error.message}`
                  : 'Server status refresh failed without a detailed message.',
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

  async function handleRefreshSupervisorReviewQueue() {
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
              authMessage: `${supervisorReviewQueue.length} relatorio(s) de revisao carregado(s).`,
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
                  : 'Review queue failed without a detailed message.',
            },
      );
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
                  : 'Review report detail failed without a detailed message.',
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
                  : 'Review approval failed without a detailed message.',
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
                  : 'Review return failed without a detailed message.',
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
                  : 'Supervisor escalation failed without a detailed message.',
            },
      );
    }
  }

  return (
    <>
    <VisualProductShell
      apiBaseUrl={getDefaultAuthApiBaseUrl()}
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
      onRefreshSupervisorReviewQueue={() => handleRefreshSupervisorReviewQueue()}
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
      onSignIn={() => void handleSignIn()}
      onStartQrScanner={() => void handleStartQrScanner()}
      onSupervisorEscalationRationaleChange={handleSupervisorEscalationRationaleChange}
      onSupervisorReturnCommentChange={handleSupervisorReturnCommentChange}
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

/*
  const selectedExecutionStep =
    readyState.executionShell?.steps.find(
      (step) => step.id === readyState.executionShell?.progress.currentStepId,
    ) ?? null;
  const selectedExecutionStepIndex =
    readyState.executionShell && selectedExecutionStep
      ? readyState.executionShell.steps.findIndex((step) => step.id === selectedExecutionStep.id)
      : -1;
  const selectedExecutionTemplate =
    readyState.selectedTagContext
      ? resolveExplicitExecutionTemplateSelection(
          readyState.selectedTagContext.referencePointers.executionTemplates,
          readyState.selectedExecutionTemplateId,
        )
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.badge}>
            {readyState.session ? 'Aplicativo autenticado localmente' : 'Login online obrigatorio'}
          </Text>
          <Text style={styles.heroTitle}>
            {readyState.session ? readyState.session.displayName : 'TagWise session bootstrap'}
          </Text>
          <Text style={styles.heroBody}>
            {readyState.session
              ? `Role: ${readyState.session.role}. Session mode: ${readyState.session.connectionMode}.`
              : `Sign in against ${getDefaultAuthApiBaseUrl()} while connected. The app will restore the same role-scoped session offline from secure storage and SQLite cache.`}
          </Text>
        </View>

        {readyState.authMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.helperText}>{readyState.authMessage}</Text>
          </View>
        ) : null}

        {!readyState.session ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Login online</Text>
            <Text style={styles.panelBody}>
              Only connected login is allowed in v1. After the first successful sign-in, the same
              device session can reopen offline.
            </Text>

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              disabled={readyState.authBusy}
              onPress={() => void handleSignIn()}
              style={[styles.primaryButton, readyState.authBusy ? styles.buttonDisabled : null]}
            >
              <Text style={styles.primaryButtonLabel}>
                {readyState.authBusy ? 'Entrando...' : 'Entrar'}
              </Text>
            </Pressable>

            <Text style={styles.helperText}>
              Seed accounts come from the backend bootstrap environment. Default local examples use
              `tech@tagwise.local`, `supervisor@tagwise.local`, and `manager@tagwise.local`.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.routeRow}>
              {placeholderRoutes.map((route) => {
                const selected = route.key === readyState.route;

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    onPress={() => void handleRouteChange(route.key)}
                    style={[styles.routeButton, selected ? styles.routeButtonActive : null]}
                  >
                    <Text
                      style={[styles.routeButtonLabel, selected ? styles.routeButtonLabelActive : null]}
                    >
                      {route.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Session guardrails</Text>
              <Text style={styles.panelBody}>
                Connected login establishes the session. Offline restore uses cached role metadata,
                but review actions remain server-validated and unavailable offline.
              </Text>

              <View style={styles.metricGrid}>
                <MetricCard label="Role" value={readyState.session.role} />
                <MetricCard label="Session" value={readyState.session.connectionMode} />
              </View>

              <View style={styles.metricGrid}>
                <MetricCard
                  label="Review actions"
                  value={readyState.session.reviewActionsAvailable ? 'Available' : 'Unavailable'}
                />
                <MetricCard
                  label="Signed in"
                  value={formatTimestamp(readyState.session.lastAuthenticatedAt)}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={readyState.authBusy}
                onPress={() => void handleSwitchUser()}
                style={[styles.secondaryButton, readyState.authBusy ? styles.buttonDisabled : null]}
              >
                <Text style={styles.secondaryButtonLabel}>
                  {readyState.authBusy ? 'Verificando sessao...' : 'Trocar usuario'}
                </Text>
              </Pressable>

              <Text style={styles.helperText}>
                Offline user switching stays blocked when unsynced local work exists. Review actions
                do not become authoritative from cached role state alone.
              </Text>
            </View>

            {readyState.route === DEFAULT_SHELL_ROUTE ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{readyState.demoRecord.title}</Text>
                <Text style={styles.panelBody}>{readyState.demoRecord.subtitle}</Text>

                <View style={styles.metricGrid}>
                  <MetricCard label="Launch count" value={String(readyState.demoRecord.launchCount)} />
                  <MetricCard
                    label="Manual writes"
                    value={String(readyState.demoRecord.manualWriteCount)}
                  />
                </View>

                <View style={styles.metricGrid}>
                  <MetricCard
                    label="Last opened"
                    value={formatTimestamp(readyState.demoRecord.lastOpenedAt)}
                  />
                  <MetricCard
                    label="Updated"
                    value={formatTimestamp(readyState.demoRecord.updatedAt)}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleManualWrite()}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonLabel}>Write local record</Text>
                </Pressable>

                <Text style={styles.helperText}>
                  Existing Story 1.1 proof data remains local-first and persists across restart.
                </Text>

                <View style={styles.metricGrid}>
                  <MetricCard
                    label="Captured errors"
                    value={String(readyState.diagnostics.capturedErrorCount)}
                  />
                  <MetricCard
                    label="Latest error route"
                    value={readyState.diagnostics.latestErrorShellRoute ?? 'none'}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleCaptureDiagnosticError()}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonLabel}>Capture diagnostic error</Text>
                </Pressable>

                <Text style={styles.helperText}>
                  Latest mobile diagnostic: {readyState.diagnostics.latestErrorMessage ?? 'none'}.
                </Text>
              </View>
            ) : readyState.route === 'packages' ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Assigned work packages</Text>
                <Text style={styles.panelBody}>
                  Download bounded package snapshots before entering the field. Downloaded
                  snapshots stay local-first and remain available after reconnect-free reopen.
                </Text>

                <View style={styles.metricGrid}>
                  <MetricCard label="Packages" value={String(readyState.workPackages.length)} />
                  <MetricCard
                    label="Downloaded"
                    value={String(readyState.workPackages.filter((item) => item.hasSnapshot).length)}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={
                    readyState.packageBusy || readyState.session.connectionMode !== 'connected'
                  }
                  onPress={() => void handleRefreshAssignedPackages()}
                  style={[
                    styles.primaryButton,
                    readyState.packageBusy || readyState.session.connectionMode !== 'connected'
                      ? styles.buttonDisabled
                      : null,
                  ]}
                >
                  <Text style={styles.primaryButtonLabel}>
                    {readyState.packageBusy ? 'Atualizando pacotes...' : 'Atualizar pacotes atribuidos'}
                  </Text>
                </Pressable>

                <Text style={styles.helperText}>
                  {readyState.session.connectionMode === 'connected'
                    ? 'No modo online voce pode atualizar a lista de pacotes e baixar os snapshots.'
                    : 'No modo offline voce pode abrir pacotes ja baixados, mas atualizar/baixar so funciona apos reconectar.'}
                </Text>

                <View style={styles.listCard}>
                  <Text style={styles.listCardTitle}>QR scan entry</Text>
                  <Text style={styles.helperText}>
                    Scan a tag QR code or paste the payload below. Resolution always happens against
                    the already-downloaded local package scope first.
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleStartQrScanner()}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonLabel}>Scan tag QR code</Text>
                  </Pressable>

                  <TextInput
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onChangeText={handleQrPayloadChange}
                    placeholder="Paste QR payload for simulator/manual test"
                    style={styles.input}
                    value={readyState.qrManualPayload}
                  />

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleResolveManualQrPayload()}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonLabel}>Resolve pasted QR payload</Text>
                  </Pressable>

                  {readyState.qrScannerVisible ? (
                    <View style={styles.cameraCard}>
                      <CameraView
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={(event) => void handleBarcodeScanned(event)}
                        style={styles.cameraViewport}
                      />
                      <Text style={styles.helperText}>
                        Point the camera at a TagWise tag QR code. Cached hits open locally without
                        requiring a network call.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleCancelQrScanner}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryButtonLabel}>Cancel scan</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {readyState.qrScanResult && readyState.qrScanResult.state !== 'hit' ? (
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>
                        {readyState.qrScanResult.state === 'miss' ? 'Not cached offline' : 'Invalid scan'}
                      </Text>
                      <Text style={styles.metricValue}>{readyState.qrScanResult.message}</Text>
                      <Text style={styles.helperText}>{readyState.qrScanResult.guidance}</Text>
                    </View>
                  ) : null}
                </View>

                {readyState.workPackages.length === 0 ? (
                  <Text style={styles.helperText}>
                    Nenhum pacote atribuido esta em cache neste dispositivo ainda. Atualize enquanto estiver online para
                    load your bounded working set.
                  </Text>
                ) : null}

                {readyState.activeTagPackageId ? (
                  <View style={styles.listCard}>
                    <Text style={styles.listCardTitle}>Local tag entry</Text>
                    <Text style={styles.helperText}>
                      Package {readyState.visibleTags[0]?.workPackageTitle ?? readyState.activeTagPackageId}.
                      Search stays inside this downloaded package only.
                    </Text>

                    <TextInput
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={(value) => void handleTagSearchChange(value)}
                      placeholder="Search tag code or short description"
                      style={styles.input}
                      value={readyState.tagSearchQuery}
                    />

                    <Text style={styles.helperText}>
                      Results never imply access to uncached tags outside the local snapshot.
                    </Text>

                    {readyState.selectedTagContext && !readyState.executionShell ? (
                      <View style={styles.listCard}>
                        <Text style={styles.listCardTitle}>Tag context</Text>
                        <Text style={styles.metricValue}>{readyState.selectedTagContext.tagCode}</Text>
                        <Text style={styles.helperText}>
                          {readyState.selectedTagContext.shortDescription}
                        </Text>

                        <View style={styles.metricGrid}>
                          <ContextFieldCard field={readyState.selectedTagContext.area} />
                          <ContextFieldCard
                            field={readyState.selectedTagContext.parentAssetReference}
                          />
                        </View>

                        <View style={styles.metricGrid}>
                          <ContextFieldCard field={readyState.selectedTagContext.instrumentFamily} />
                          <ContextFieldCard field={readyState.selectedTagContext.instrumentSubtype} />
                        </View>

                        <View style={styles.metricGrid}>
                          <ContextFieldCard field={readyState.selectedTagContext.measuredVariable} />
                          <ContextFieldCard field={readyState.selectedTagContext.signalType} />
                        </View>

                        <View style={styles.metricGrid}>
                          <ContextFieldCard field={readyState.selectedTagContext.range} />
                          <ContextFieldCard field={readyState.selectedTagContext.tolerance} />
                        </View>

                        <View style={styles.metricGrid}>
                          <ContextFieldCard field={readyState.selectedTagContext.criticality} />
                          <ContextFieldCard
                            field={{
                              label: readyState.selectedTagContext.dueIndicator.label,
                              value: readyState.selectedTagContext.dueIndicator.value,
                              state: readyState.selectedTagContext.dueIndicator.state,
                            }}
                          />
                        </View>

                        <View
                          style={[
                            styles.metricCard,
                            readyState.selectedTagContext.historyPreview.state === 'missing'
                              ? styles.missingMetricCard
                              : null,
                          ]}
                        >
                          <Text style={styles.metricLabel}>
                            {readyState.selectedTagContext.historyPreview.title}
                          </Text>
                          <Text style={styles.metricValue}>
                            {readyState.selectedTagContext.historyPreview.summary}
                          </Text>
                          <Text style={styles.helperText}>
                            {readyState.selectedTagContext.historyPreview.detail}
                          </Text>
                          <Text style={styles.helperText}>
                            Last observed:{' '}
                            {readyState.selectedTagContext.historyPreview.lastObservedAt
                              ? formatTimestamp(readyState.selectedTagContext.historyPreview.lastObservedAt)
                              : readyState.selectedTagContext.historyPreview.state === 'unavailable'
                                ? 'Not included in this package'
                                : 'Missing'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.metricCard,
                            readyState.selectedTagContext.referencePointers.state === 'missing'
                              ? styles.missingMetricCard
                              : null,
                          ]}
                        >
                          <Text style={styles.metricLabel}>Local references</Text>
                          <Text style={styles.helperText}>
                            {readyState.selectedTagContext.referencePointers.detail}
                          </Text>
                          <Text style={styles.helperText}>
                            Templates:{' '}
                            {readyState.selectedTagContext.referencePointers.templates.length > 0
                              ? readyState.selectedTagContext.referencePointers.templates.join(', ')
                              : 'None attached'}
                          </Text>
                          <Text style={styles.helperText}>
                            Guidance:{' '}
                            {readyState.selectedTagContext.referencePointers.guidance.length > 0
                              ? readyState.selectedTagContext.referencePointers.guidance.join(', ')
                              : 'None attached'}
                          </Text>
                        </View>

                        {readyState.selectedTagContext.referencePointers.executionTemplates.length > 0 ? (
                          <View style={styles.listCard}>
                            <Text style={styles.listCardTitle}>Execution templates</Text>
                            <Text style={styles.helperText}>
                              Choose the approved local transmitter pattern before opening the shared shell.
                            </Text>

                            {readyState.selectedTagContext.referencePointers.executionTemplates.map(
                              (template) => {
                                const isSelected =
                                  template.id === readyState.selectedExecutionTemplateId;

                                return (
                                  <Pressable
                                    key={template.id}
                                    accessibilityRole="button"
                                    onPress={() => handleSelectExecutionTemplate(template.id)}
                                    style={[
                                      styles.secondaryButton,
                                      isSelected ? styles.routeButtonActive : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.secondaryButtonLabel,
                                        isSelected ? styles.routeButtonLabelActive : null,
                                      ]}
                                    >
                                      {template.title} ({template.testPattern})
                                    </Text>
                                  </Pressable>
                                );
                              },
                            )}

                            {selectedExecutionTemplate ? (
                              <>
                                <Text style={styles.metricValue}>
                                  {selectedExecutionTemplate.instrumentFamily}
                                </Text>
                                <Text style={styles.helperText}>
                                  {selectedExecutionTemplate.captureSummary}
                                </Text>
                                <Text style={styles.helperText}>
                                  Minimum evidence:{' '}
                                  {selectedExecutionTemplate.minimumSubmissionEvidence.join(', ')}
                                </Text>
                                <Text style={styles.helperText}>
                                  Expected evidence:{' '}
                                  {selectedExecutionTemplate.expectedEvidence.length > 0
                                    ? selectedExecutionTemplate.expectedEvidence.join(', ')
                                    : 'None declared'}
                                </Text>
                              </>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={styles.helperText}>
                            No approved local execution template is attached to this tag yet.
                          </Text>
                        )}

                        <Pressable
                          accessibilityRole="button"
                          disabled={!selectedExecutionTemplate}
                          onPress={() => void handleProceedToExecutionShell()}
                          style={[
                            styles.primaryButton,
                            !selectedExecutionTemplate ? styles.buttonDisabled : null,
                          ]}
                        >
                          <Text style={styles.primaryButtonLabel}>Proceed to execution shell</Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {readyState.executionShell && selectedExecutionStep ? (
                      <View style={styles.listCard}>
                        <Text style={styles.listCardTitle}>Shared execution shell</Text>
                        <Text style={styles.metricValue}>{readyState.executionShell.tagCode}</Text>
                        <Text style={styles.helperText}>
                          {readyState.executionShell.template.title} /{' '}
                          {readyState.executionShell.template.instrumentFamily} /{' '}
                          {readyState.executionShell.template.testPattern}
                        </Text>

                        <View style={styles.metricGrid}>
                          <MetricCard
                            label="Template version"
                            value={readyState.executionShell.template.version}
                          />
                          <MetricCard
                            label="Step"
                            value={`${selectedExecutionStepIndex + 1} of ${readyState.executionShell.steps.length}`}
                          />
                        </View>

                        <View style={styles.listCard}>
                          <Text style={styles.metricLabel}>Execution steps</Text>
                          {readyState.executionShell.steps.map((step) => {
                            const isCurrent =
                              step.id === readyState.executionShell?.progress.currentStepId;
                            const isVisited = readyState.executionShell?.progress.visitedStepIds.includes(
                              step.id,
                            );

                            return (
                              <Pressable
                                key={step.id}
                                accessibilityRole="button"
                                onPress={() => void handleOpenExecutionStep(step.id)}
                                style={[
                                  styles.secondaryButton,
                                  isCurrent ? styles.routeButtonActive : null,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.secondaryButtonLabel,
                                    isCurrent ? styles.routeButtonLabelActive : null,
                                  ]}
                                >
                                  {step.title} {isCurrent ? '(Current)' : isVisited ? '(Visited)' : '(Upcoming)'}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <View style={styles.metricCard}>
                          <Text style={styles.metricLabel}>{selectedExecutionStep.title}</Text>
                          <Text style={styles.metricValue}>{selectedExecutionStep.summary}</Text>
                          <Text style={styles.helperText}>{selectedExecutionStep.detail}</Text>
                        </View>

                        {selectedExecutionStep.fields.map((field) => (
                          <ExecutionFieldCard key={field.label} field={field} />
                        ))}

                        {selectedExecutionStep.kind === 'calculation' &&
                        readyState.executionShell.calculation ? (
                          <View style={styles.listCard}>
                            <Text style={styles.metricLabel}>Deterministic calculation</Text>
                            <Text style={styles.helperText}>
                              {readyState.executionShell.template.captureSummary}
                            </Text>
                            <Text style={styles.metricLabel}>
                              {readyState.executionShell.calculation.definition.expectedLabel}
                            </Text>
                            <TextInput
                              autoCapitalize="none"
                              autoCorrect={false}
                              editable={
                                readyState.executionShell.report.state === 'technician-owned-draft'
                              }
                              keyboardType="decimal-pad"
                              onChangeText={(value) =>
                                handleExecutionCalculationInputChange('expectedValue', value)
                              }
                              placeholder={readyState.executionShell.calculation.definition.expectedLabel}
                              style={styles.input}
                              value={readyState.executionShell.calculation.rawInputs.expectedValue}
                            />
                            <Text style={styles.metricLabel}>
                              {readyState.executionShell.calculation.definition.observedLabel}
                            </Text>
                            <TextInput
                              autoCapitalize="none"
                              autoCorrect={false}
                              editable={
                                readyState.executionShell.report.state === 'technician-owned-draft'
                              }
                              keyboardType="decimal-pad"
                              onChangeText={(value) =>
                                handleExecutionCalculationInputChange('observedValue', value)
                              }
                              placeholder={readyState.executionShell.calculation.definition.observedLabel}
                              style={styles.input}
                              value={readyState.executionShell.calculation.rawInputs.observedValue}
                            />
                            <Pressable
                              accessibilityRole="button"
                              disabled={
                                readyState.executionShell.report.state !== 'technician-owned-draft'
                              }
                              onPress={() => void handleSaveExecutionCalculation()}
                              style={[
                                styles.primaryButton,
                                readyState.executionShell.report.state !== 'technician-owned-draft'
                                  ? styles.buttonDisabled
                                  : null,
                              ]}
                            >
                              <Text style={styles.primaryButtonLabel}>
                                Run deterministic calculation
                              </Text>
                            </Pressable>

                            {readyState.executionShell.calculation.result ? (
                              <>
                                <View style={styles.metricGrid}>
                                  <MetricCard
                                    label="Acceptance"
                                    value={toAcceptanceLabel(
                                      readyState.executionShell.calculation.result.acceptance,
                                    )}
                                  />
                                  <MetricCard
                                    label="Updated"
                                    value={
                                      readyState.executionShell.calculation.updatedAt
                                        ? formatTimestamp(
                                            readyState.executionShell.calculation.updatedAt,
                                          )
                                        : 'Not saved yet'
                                    }
                                  />
                                </View>

                                <View style={styles.metricGrid}>
                                  <MetricCard
                                    label="Signed deviation"
                                    value={formatDeviation(
                                      readyState.executionShell.calculation.result.signedDeviation,
                                      readyState.executionShell.calculation.definition.unit,
                                    )}
                                  />
                                  <MetricCard
                                    label="Absolute deviation"
                                    value={formatDeviation(
                                      readyState.executionShell.calculation.result
                                        .absoluteDeviation,
                                      readyState.executionShell.calculation.definition.unit,
                                    )}
                                  />
                                </View>

                                <View style={styles.metricGrid}>
                                  <MetricCard
                                    label="Percent of span"
                                    value={
                                      readyState.executionShell.calculation.result.percentOfSpan !==
                                      null
                                        ? `${readyState.executionShell.calculation.result.percentOfSpan.toFixed(3)}%`
                                        : 'Not available'
                                    }
                                  />
                                  <MetricCard
                                    label="Tolerance source"
                                    value={
                                      readyState.executionShell.calculation.definition.toleranceSource
                                    }
                                  />
                                </View>

                                <Text style={styles.helperText}>
                                  {readyState.executionShell.calculation.result.acceptanceReason}
                                </Text>
                              </>
                            ) : null}
                          </View>
                        ) : null}

                        {selectedExecutionStep.kind === 'guidance' ? (
                          <ExecutionGuidancePanel
                            evidence={readyState.executionShell.evidence}
                            guidance={readyState.executionShell.guidance}
                            editable={
                              readyState.executionShell.report.state === 'technician-owned-draft'
                            }
                            onAttachPhotoFromCamera={() => void handleAttachExecutionPhoto('camera')}
                            onAttachPhotoFromLibrary={() => void handleAttachExecutionPhoto('library')}
                            onChecklistOutcomeChange={handleChecklistOutcomeChange}
                            onObservationNotesChange={handleObservationNotesChange}
                            onRiskJustificationChange={handleRiskJustificationChange}
                            onRemovePhotoAttachment={(evidenceId) =>
                              void handleRemoveExecutionPhoto(evidenceId)
                            }
                            onSaveEvidence={() => void handleSaveExecutionEvidence()}
                          />
                        ) : null}

                        {selectedExecutionStep.kind === 'report' ? (
                          <ExecutionReportDraftPanel
                            report={readyState.executionShell.report}
                            syncDetail={readyState.reportSyncDetail}
                            syncBusy={readyState.syncBusy}
                            editable={
                              readyState.executionShell.report.state === 'technician-owned-draft'
                            }
                            onReviewNotesChange={handleReportReviewNotesChange}
                            onRefreshServerStatus={() =>
                              void handleRefreshExecutionReportServerStatus()
                            }
                            onRetrySync={() => void handleRetryExecutionReportSync()}
                            onSaveReportDraft={() => void handleSaveReportDraft()}
                            onSubmitReport={() => void handleSubmitExecutionReport()}
                          />
                        ) : null}

                        <View style={styles.metricGrid}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={selectedExecutionStepIndex <= 0}
                            onPress={() => void handleMoveExecutionStep('previous')}
                            style={[
                              styles.secondaryButton,
                              selectedExecutionStepIndex <= 0 ? styles.buttonDisabled : null,
                            ]}
                          >
                            <Text style={styles.secondaryButtonLabel}>Previous step</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            disabled={
                              selectedExecutionStepIndex < 0 ||
                              selectedExecutionStepIndex >= readyState.executionShell.steps.length - 1
                            }
                            onPress={() => void handleMoveExecutionStep('next')}
                            style={[
                              styles.primaryButton,
                              selectedExecutionStepIndex < 0 ||
                              selectedExecutionStepIndex >= readyState.executionShell.steps.length - 1
                                ? styles.buttonDisabled
                                : null,
                            ]}
                          >
                            <Text style={styles.primaryButtonLabel}>Next step</Text>
                          </Pressable>
                        </View>

                        <Pressable
                          accessibilityRole="button"
                          onPress={handleReturnToTagContext}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonLabel}>Back to tag context</Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {readyState.visibleTags.length === 0 ? (
                      <Text style={styles.helperText}>No cached tags matched this local search.</Text>
                    ) : (
                      readyState.visibleTags.map((tag) => (
                        <View key={tag.tagId} style={styles.metricCard}>
                          <Text style={styles.metricValue}>{tag.tagCode}</Text>
                          <Text style={styles.helperText}>{tag.shortDescription}</Text>
                          <Text style={styles.helperText}>
                            {tag.area} / {tag.instrumentFamily}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void handleOpenTag(tag.tagId)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonLabel}>Abrir tag</Text>
                          </Pressable>
                        </View>
                      ))
                    )}

                    <Pressable
                      accessibilityRole="button"
                      onPress={handleCloseTagBrowser}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonLabel}>Back to package list</Text>
                    </Pressable>
                  </View>
                ) : null}

                {readyState.workPackages.map((workPackage) => {
                  const readiness = evaluateAssignedWorkPackageReadiness(workPackage);
                  const syncSummary =
                    readyState.packageSyncSummaries[workPackage.id] ??
                    buildEmptyWorkPackageSyncSummary(workPackage.id);
                  const syncBadge = buildSyncStateBadgeModel(syncSummary.syncState);

                  return (
                    <View key={workPackage.id} style={styles.listCard}>
                    <Text style={styles.listCardTitle}>{workPackage.title}</Text>
                    <Text style={styles.helperText}>
                      {workPackage.id} / {workPackage.sourceReference}
                    </Text>
                    <SyncStateBadge label={syncBadge.label} tone={syncBadge.tone} />

                    <View style={styles.metricGrid}>
                      <MetricCard label="Priority" value={workPackage.priority} />
                      <MetricCard label="Tags" value={String(workPackage.tagCount)} />
                    </View>

                    <View style={styles.metricGrid}>
                      <MetricCard
                        label="Readiness"
                        value={readiness.label}
                      />
                      <MetricCard
                        label="Due"
                        value={formatDueWindow(workPackage.dueWindow.endsAt)}
                      />
                    </View>

                    <View style={styles.metricGrid}>
                      <MetricCard
                        label="Refreshed"
                        value={
                          workPackage.downloadedAt
                            ? formatTimestamp(workPackage.downloadedAt)
                            : 'Not yet'
                        }
                      />
                      <MetricCard
                        label="Source freshness"
                        value={formatAssignedWorkPackageFreshness(workPackage.snapshotGeneratedAt)}
                      />
                    </View>

                    <View style={styles.metricGrid}>
                      <MetricCard label="Sync" value={syncSummary.label} />
                      <MetricCard
                        label="Queued items"
                        value={String(syncSummary.queueItemCount)}
                      />
                    </View>

                    <Text style={styles.helperText}>{readiness.detail}</Text>
                    <Text style={styles.helperText}>{syncSummary.detail}</Text>

                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        readyState.packageBusy || readyState.session?.connectionMode !== 'connected'
                      }
                      onPress={() => void handleDownloadAssignedPackage(workPackage.id)}
                      style={[
                        styles.secondaryButton,
                        readyState.packageBusy || readyState.session?.connectionMode !== 'connected'
                          ? styles.buttonDisabled
                          : null,
                      ]}
                    >
                      <Text style={styles.secondaryButtonLabel}>
                        {workPackage.hasSnapshot ? 'Refresh snapshot' : 'Download snapshot'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={!workPackage.hasSnapshot}
                      onPress={() => void handleBrowsePackageTags(workPackage.id)}
                      style={[
                        styles.secondaryButton,
                        !workPackage.hasSnapshot ? styles.buttonDisabled : null,
                      ]}
                    >
                      <Text style={styles.secondaryButtonLabel}>Explorar tags em cache</Text>
                    </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : readyState.route === 'review' ? (
              <SupervisorReviewPanel
                busy={readyState.reviewBusy}
                escalationRationale={readyState.supervisorEscalationRationale}
                queue={readyState.supervisorReviewQueue}
                returnComment={readyState.supervisorReturnComment}
                selectedReport={readyState.selectedSupervisorReviewReport}
                session={readyState.session}
                onApproveReport={(reportId) => void handleApproveSupervisorReviewReport(reportId)}
                onCloseReport={handleCloseSupervisorReviewReport}
                onEscalateReport={(reportId) => void handleEscalateSupervisorReviewReport(reportId)}
                onEscalationRationaleChange={handleSupervisorEscalationRationaleChange}
                onOpenReport={(reportId) => void handleOpenSupervisorReviewReport(reportId)}
                onRefresh={() => void handleRefreshSupervisorReviewQueue()}
                onReturnCommentChange={handleSupervisorReturnCommentChange}
                onReturnReport={(reportId) => void handleReturnSupervisorReviewReport(reportId)}
              />
            ) : (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Local storage diagnostics</Text>
                <Text style={styles.panelBody}>
                  SQLite now also holds user-partitioned draft, evidence, and queue placeholders while
                  the sandbox boundary isolates future media files under the authenticated user.
                </Text>

                <View style={styles.metricGrid}>
                  <MetricCard label="Database" value={readyState.databaseName} />
                  <MetricCard
                    label="Schema version"
                    value={String(readyState.migrationSummary.currentSchemaVersion)}
                  />
                </View>

                <View style={styles.metricGrid}>
                  <MetricCard
                    label="Applied this launch"
                    value={
                      readyState.migrationSummary.appliedMigrationIds.length > 0
                        ? readyState.migrationSummary.appliedMigrationIds.join(', ')
                        : 'none'
                    }
                  />
                  <MetricCard label="Shell route" value={readyState.route} />
                </View>

                <View style={styles.metricGrid}>
                  <MetricCard
                    label="Owned drafts"
                    value={String(readyState.localOwnership?.draftCount ?? 0)}
                  />
                  <MetricCard
                    label="Owned evidence"
                    value={String(readyState.localOwnership?.evidenceCount ?? 0)}
                  />
                </View>

                <View style={styles.metricGrid}>
                  <MetricCard
                    label="Owned queue"
                    value={String(readyState.localOwnership?.queueItemCount ?? 0)}
                  />
                  <MetricCard
                    label="Owner"
                    value={readyState.localOwnership?.ownerUserId ?? readyState.session.userId}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleWriteLocalOwnershipProof()}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonLabel}>Write owned local sample</Text>
                </Pressable>

                <Text style={styles.helperText}>
                  Demo business object: {readyState.localOwnership?.businessObjectType ?? 'tag'}/
                  {readyState.localOwnership?.businessObjectId ?? 'demo-tag-001'}.
                </Text>

                <Text style={styles.helperText}>
                  Latest owned media path:{' '}
                  {readyState.localOwnership?.latestMediaRelativePath ?? 'not created yet'}.
                </Text>

                <Text style={styles.helperText}>
                  Switching users does not reassign local ownership. Another signed-in user will only
                  query their own partition for these draft, evidence, and queue placeholders.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
*/

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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SyncStateBadge({ label, tone }: { label: string; tone: SyncStateTone }) {
  return (
    <View style={[styles.syncBadge, getSyncBadgeStyle(tone)]}>
      <Text style={[styles.syncBadgeLabel, getSyncBadgeLabelStyle(tone)]}>{label}</Text>
    </View>
  );
}

function SupervisorReviewPanel({
  busy,
  escalationRationale,
  queue,
  returnComment,
  selectedReport,
  session,
  onApproveReport,
  onCloseReport,
  onEscalateReport,
  onEscalationRationaleChange,
  onOpenReport,
  onRefresh,
  onReturnCommentChange,
  onReturnReport,
}: {
  busy: boolean;
  escalationRationale: string;
  queue: SupervisorReviewQueueItem[];
  returnComment: string;
  selectedReport: SupervisorReviewReportDetail | null;
  session: ActiveUserSession | null;
  onApproveReport: (reportId: string) => void;
  onCloseReport: () => void;
  onEscalateReport: (reportId: string) => void;
  onEscalationRationaleChange: (value: string) => void;
  onOpenReport: (reportId: string) => void;
  onRefresh: () => void;
  onReturnCommentChange: (value: string) => void;
  onReturnReport: (reportId: string) => void;
}) {
  const reviewerRole = session?.role === 'manager' ? 'manager' : 'supervisor';
  const canRefresh =
    (session?.role === 'supervisor' || session?.role === 'manager') &&
    session.connectionMode === 'connected';

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>
        {reviewerRole === 'manager' ? 'Manager review' : 'Supervisor review'}
      </Text>
      <Text style={styles.panelBody}>
        {reviewerRole === 'manager'
          ? 'Escalated per-tag reports appear here for connected manager review.'
          : 'Server-accepted per-tag reports appear here for connected supervisor review.'}
      </Text>

      <View style={styles.metricGrid}>
        <MetricCard label="Queued reports" value={String(queue.length)} />
        <MetricCard
          label="Review access"
          value={canRefresh ? 'Online' : 'Indisponivel'}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!canRefresh || busy}
        onPress={onRefresh}
        style={[styles.primaryButton, !canRefresh || busy ? styles.buttonDisabled : null]}
      >
        <Text style={styles.primaryButtonLabel}>
          {busy ? 'Carregando fila de revisao...' : 'Atualizar fila de revisao'}
        </Text>
      </Pressable>

      {!canRefresh ? (
        <Text style={styles.helperText}>
          Review requires a connected supervisor or manager session.
        </Text>
      ) : null}

      {selectedReport ? (
        <SupervisorReviewDetailPanel
          busy={busy}
          escalationRationale={escalationRationale}
          report={selectedReport}
          returnComment={returnComment}
          session={session}
          onApproveReport={onApproveReport}
          onCloseReport={onCloseReport}
          onEscalateReport={onEscalateReport}
          onEscalationRationaleChange={onEscalationRationaleChange}
          onReturnCommentChange={onReturnCommentChange}
          onReturnReport={onReturnReport}
        />
      ) : queue.length === 0 ? (
        <Text style={styles.helperText}>
          {reviewerRole === 'manager'
            ? 'No escalated reports are currently routed here.'
            : 'No server-accepted reports are currently routed here.'}
        </Text>
      ) : (
        queue.map((item) => (
          <View key={item.reportId} style={styles.listCard}>
            <Text style={styles.listCardTitle}>{item.tagId}</Text>
            <Text style={styles.helperText}>{item.reportId}</Text>
            <View style={styles.metricGrid}>
              <MetricCard label="Work package" value={item.workPackageId} />
              <MetricCard label="Lifecycle" value={item.lifecycleState} />
            </View>
            <View style={styles.metricGrid}>
              <MetricCard label="Risk flags" value={String(item.riskFlagCount)} />
              <MetricCard label="Pending evidence" value={String(item.pendingEvidenceCount)} />
            </View>
            <Text style={styles.helperText}>{item.executionSummary}</Text>
            <Text style={styles.helperText}>Accepted: {formatTimestamp(item.acceptedAt)}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!canRefresh || busy}
              onPress={() => onOpenReport(item.reportId)}
              style={[styles.secondaryButton, !canRefresh || busy ? styles.buttonDisabled : null]}
            >
              <Text style={styles.secondaryButtonLabel}>Abrir detalhe do relatorio</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function SupervisorReviewDetailPanel({
  busy,
  escalationRationale,
  report,
  returnComment,
  session,
  onApproveReport,
  onCloseReport,
  onEscalateReport,
  onEscalationRationaleChange,
  onReturnCommentChange,
  onReturnReport,
}: {
  busy: boolean;
  escalationRationale: string;
  report: SupervisorReviewReportDetail;
  returnComment: string;
  session: ActiveUserSession | null;
  onApproveReport: (reportId: string) => void;
  onCloseReport: () => void;
  onEscalateReport: (reportId: string) => void;
  onEscalationRationaleChange: (value: string) => void;
  onReturnCommentChange: (value: string) => void;
  onReturnReport: (reportId: string) => void;
}) {
  const isManagerReview = session?.role === 'manager';
  const canAct =
    (session?.role === 'supervisor' || session?.role === 'manager') &&
    session.connectionMode === 'connected';
  const canEscalate = session?.role === 'supervisor' && session.connectionMode === 'connected';
  const returnCommentReady = returnComment.trim().length > 0;
  const escalationRationaleReady = escalationRationale.trim().length > 0;

  return (
    <View style={styles.listCard}>
      <Text style={styles.listCardTitle}>Report detail</Text>
      <Text style={styles.helperText}>{report.serverReportVersion}</Text>

      <View style={styles.metricGrid}>
        <MetricCard label="Tag" value={report.tagId} />
        <MetricCard label="Template" value={report.templateId} />
      </View>
      <View style={styles.metricGrid}>
        <MetricCard label="Lifecycle" value={report.lifecycleState} />
        <MetricCard label="Sync" value={report.syncState} />
      </View>
      <View style={styles.metricGrid}>
        <MetricCard label="Submitted" value={formatTimestamp(report.submittedAt)} />
        <MetricCard label="Accepted" value={formatTimestamp(report.acceptedAt)} />
      </View>
      <View style={styles.metricGrid}>
        <MetricCard
          label="Official actions"
          value={session?.reviewActionsAvailable ? 'Online' : 'Indisponivel'}
        />
        <MetricCard label="Evidence" value={report.evidenceStatus.state} />
      </View>

      <Text style={styles.sectionTitle}>Execution summary</Text>
      <Text style={styles.helperText}>{report.executionSummary}</Text>
      <Text style={styles.helperText}>{report.historySummary}</Text>
      <Text style={styles.helperText}>{report.draftDiagnosisSummary}</Text>

      <Text style={styles.sectionTitle}>Evidence references</Text>
      {report.evidenceReferences.map((item) => (
        <View key={`${item.requirementLevel}:${item.label}`} style={styles.metricCard}>
          <Text style={styles.metricLabel}>{item.requirementLevel}</Text>
          <Text style={styles.metricValue}>{item.label}</Text>
          <Text style={styles.helperText}>Kind: {item.evidenceKind}</Text>
          <Text style={styles.helperText}>Status: {item.satisfied ? 'Satisfied' : 'Missing'}</Text>
          <Text style={styles.helperText}>{item.detail}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Risk flags</Text>
      {report.riskFlags.length === 0 ? (
        <Text style={styles.helperText}>No risk flags are attached to this report.</Text>
      ) : (
        report.riskFlags.map((item) => (
          <View key={item.id} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{item.reasonType}</Text>
            <Text style={styles.metricValue}>
              {item.justificationRequired ? 'Justification required' : 'Justification optional'}
            </Text>
            <Text style={styles.helperText}>{item.justificationText}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Photo evidence</Text>
      <Text style={styles.helperText}>{report.evidenceStatus.message}</Text>
      {report.photoAttachments.map((item) => (
        <View key={item.evidenceId} style={styles.metricCard}>
          <Text style={styles.metricLabel}>Photo evidence</Text>
          <Text style={styles.metricValue}>{item.evidenceId}</Text>
          <Text style={styles.helperText}>Sync: {item.syncState}</Text>
          <Text style={styles.helperText}>
            Finalized: {item.presenceFinalizedAt ? formatTimestamp(item.presenceFinalizedAt) : 'No'}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Approval history</Text>
      {report.approvalHistory.items.length === 0 ? (
        <Text style={styles.helperText}>{report.approvalHistory.placeholder}</Text>
      ) : (
        report.approvalHistory.items.map((item) => (
          <View key={item.auditEventId} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{item.actorRole}</Text>
            <Text style={styles.metricValue}>{item.actionType}</Text>
            <Text style={styles.helperText}>At: {formatTimestamp(item.occurredAt)}</Text>
            <Text style={styles.helperText}>
              State: {item.priorState ?? 'Unknown'} to {item.nextState ?? 'Unknown'}
            </Text>
            <Text style={styles.helperText}>Correlation: {item.correlationId}</Text>
            {item.comment ? <Text style={styles.helperText}>{item.comment}</Text> : null}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Review decision</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={canAct && !busy}
        multiline
        onChangeText={onReturnCommentChange}
        placeholder="Required return comment."
        style={styles.input}
        value={returnComment}
      />
      {canEscalate ? (
        <TextInput
          autoCapitalize="sentences"
          autoCorrect
          editable={canAct && !busy}
          multiline
          onChangeText={onEscalationRationaleChange}
          placeholder="Required escalation rationale."
          style={styles.input}
          value={escalationRationale}
        />
      ) : null}
      <View style={styles.metricGrid}>
        <Pressable
          accessibilityRole="button"
          disabled={!canAct || busy}
          onPress={() => onApproveReport(report.reportId)}
          style={[styles.primaryButton, !canAct || busy ? styles.buttonDisabled : null]}
        >
          <Text style={styles.primaryButtonLabel}>
            {busy
              ? 'Enviando...'
              : isManagerReview
              ? 'Approve escalated case'
              : 'Approve standard case'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canAct || busy || !returnCommentReady}
          onPress={() => onReturnReport(report.reportId)}
          style={[
            styles.secondaryButton,
            !canAct || busy || !returnCommentReady ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.secondaryButtonLabel}>Devolver com comentario</Text>
        </Pressable>
      </View>
      {canEscalate ? (
        <Pressable
          accessibilityRole="button"
          disabled={!canAct || busy || !escalationRationaleReady}
          onPress={() => onEscalateReport(report.reportId)}
          style={[
            styles.secondaryButton,
            !canAct || busy || !escalationRationaleReady ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.secondaryButtonLabel}>Escalate to manager</Text>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onCloseReport} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonLabel}>Back to review queue</Text>
      </Pressable>
    </View>
  );
}

function getSyncBadgeStyle(tone: SyncStateTone) {
  switch (tone) {
    case 'waiting':
      return styles.syncBadge_waiting;
    case 'active':
      return styles.syncBadge_active;
    case 'success':
      return styles.syncBadge_success;
    case 'attention':
      return styles.syncBadge_attention;
    default:
      return styles.syncBadge_neutral;
  }
}

function getSyncBadgeLabelStyle(tone: SyncStateTone) {
  switch (tone) {
    case 'waiting':
      return styles.syncBadgeLabel_waiting;
    case 'active':
      return styles.syncBadgeLabel_active;
    case 'success':
      return styles.syncBadgeLabel_success;
    case 'attention':
      return styles.syncBadgeLabel_attention;
    default:
      return styles.syncBadgeLabel_neutral;
  }
}

function ContextFieldCard({
  field,
}: {
  field: { label: string; value: string; state: 'available' | 'missing' };
}) {
  return (
    <View style={[styles.metricCard, field.state === 'missing' ? styles.missingMetricCard : null]}>
      <Text style={styles.metricLabel}>{field.label}</Text>
      <Text style={[styles.metricValue, field.state === 'missing' ? styles.missingMetricValue : null]}>
        {field.value}
      </Text>
    </View>
  );
}

function ExecutionFieldCard({
  field,
}: {
  field: SharedExecutionField;
}) {
  return (
    <View
      style={[
        styles.metricCard,
        field.state === 'available' ? null : styles.missingMetricCard,
      ]}
    >
      <Text style={styles.metricLabel}>{field.label}</Text>
      <Text
        style={[
          styles.metricValue,
          field.state === 'available' ? null : styles.missingMetricValue,
        ]}
      >
        {field.value}
      </Text>
    </View>
  );
}

function ExecutionReportDraftPanel({
  report,
  syncDetail,
  syncBusy,
  editable,
  onReviewNotesChange,
  onRefreshServerStatus,
  onRetrySync,
  onSaveReportDraft,
  onSubmitReport,
}: {
  report: SharedExecutionShell['report'];
  syncDetail: ReportSyncDetail | null;
  syncBusy: boolean;
  editable: boolean;
  onReviewNotesChange: (value: string) => void;
  onRefreshServerStatus: () => void;
  onRetrySync: () => void;
  onSaveReportDraft: () => void;
  onSubmitReport: () => void;
}) {
  const canSubmit = editable && report.lifecycleState === 'Ready to Submit';
  const canRefreshServerStatus = report.syncState === 'synced' && !syncBusy;
  const syncBadge = syncDetail
    ? buildSyncStateBadgeModel(syncDetail.syncState, syncDetail.detail)
    : buildSyncStateBadgeModel(report.syncState);

  return (
    <View style={styles.listCard}>
      <Text style={styles.metricLabel}>Per-tag report draft</Text>
      <Text style={styles.helperText}>
        This summary is assembled from captured local execution work so the technician reviews the
        draft instead of retyping the field session.
      </Text>
      {!editable ? (
        <Text style={styles.helperText}>
          This report is read-only in the current server lifecycle state.
        </Text>
      ) : null}

      <View
        style={[
          styles.metricCard,
          report.lifecycleState === 'In Progress' ? styles.missingMetricCard : null,
        ]}
      >
        <Text style={styles.metricLabel}>Lifecycle</Text>
        <Text
          style={[
            styles.metricValue,
            report.lifecycleState === 'In Progress' ? styles.missingMetricValue : null,
          ]}
        >
          {report.lifecycleState}
        </Text>
        <Text style={styles.helperText}>{report.tagContextSummary}</Text>
        <Text style={styles.helperText}>
          Technician: {report.technicianName} ({report.technicianEmail})
        </Text>
        <Text style={styles.helperText}>
          Sync state: {formatSyncStateLabel(report.syncState)}
        </Text>
        <Text style={styles.helperText}>
          Submitted locally: {report.submittedAt ? formatTimestamp(report.submittedAt) : 'Not submitted yet'}
        </Text>
      </View>

      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>Detalhe da sincronizacao</Text>
        <SyncStateBadge label={syncBadge.label} tone={syncBadge.tone} />
        <Text style={styles.helperText}>{syncBadge.detail}</Text>
        {syncDetail ? (
          <Text style={styles.helperText}>
            Queue items: {syncDetail.queueItemCount}. Retry-ready:{' '}
            {syncDetail.retryableQueueItemCount}. Issues: {syncDetail.issueCount}.
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!syncDetail?.canRetry || syncBusy}
          onPress={onRetrySync}
          style={[
            styles.secondaryButton,
            !syncDetail?.canRetry || syncBusy ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.secondaryButtonLabel}>
            {syncBusy ? 'Retrying sync...' : 'Retry sync'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canRefreshServerStatus}
          onPress={onRefreshServerStatus}
          style={[
            styles.secondaryButton,
            !canRefreshServerStatus ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.secondaryButtonLabel}>
            {syncBusy ? 'Atualizando status...' : 'Atualizar status do servidor'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Approval history</Text>
      {(report.approvalHistory?.items.length ?? 0) === 0 ? (
        <Text style={styles.helperText}>
          {report.approvalHistory?.placeholder ??
            'No approval decisions have been recorded for this report yet.'}
        </Text>
      ) : (
        report.approvalHistory!.items.map((item) => (
          <View key={item.auditEventId} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{item.actorRole}</Text>
            <Text style={styles.metricValue}>{item.actionType}</Text>
            <Text style={styles.helperText}>At: {formatTimestamp(item.occurredAt)}</Text>
            <Text style={styles.helperText}>
              State: {item.priorState ?? 'Unknown'} to {item.nextState ?? 'Unknown'}
            </Text>
            <Text style={styles.helperText}>Correlation: {item.correlationId}</Text>
            {item.comment ? <Text style={styles.helperText}>{item.comment}</Text> : null}
          </View>
        ))
      )}

      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>Execution summary</Text>
        <Text style={styles.metricValue}>{report.executionSummary}</Text>
      </View>

      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>History summary</Text>
        <Text style={styles.metricValue}>{report.historySummary}</Text>
      </View>

      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>Draft diagnosis summary</Text>
        <Text style={styles.metricValue}>{report.draftDiagnosisSummary}</Text>
      </View>

      <Text style={styles.sectionTitle}>Checklist outcomes</Text>
      {report.checklistOutcomes.length > 0 ? (
        report.checklistOutcomes.map((item) => (
          <View
            key={item.id}
            style={[
              styles.metricCard,
              item.outcome === 'completed' ? null : styles.missingMetricCard,
            ]}
          >
            <Text style={styles.metricLabel}>Checklist outcome</Text>
            <Text
              style={[
                styles.metricValue,
                item.outcome === 'completed' ? null : styles.missingMetricValue,
              ]}
            >
              {item.prompt}
            </Text>
            <Text style={styles.helperText}>Status: {toChecklistOutcomeLabel(item.outcome)}</Text>
            <Text style={styles.helperText}>Source: {item.sourceReference}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.helperText}>No checklist outcomes are attached to this report draft.</Text>
      )}

      <Text style={styles.sectionTitle}>Evidence references</Text>
      {report.evidenceReferences.length > 0 ? (
        report.evidenceReferences.map((reference) => (
          <View
            key={`${reference.requirementLevel}:${reference.label}`}
            style={[
              styles.metricCard,
              reference.satisfied ? null : styles.missingMetricCard,
            ]}
          >
            <Text style={styles.metricLabel}>
              {reference.requirementLevel === 'minimum'
                ? 'Minimum evidence'
                : 'Expected evidence'}
            </Text>
            <Text
              style={[
                styles.metricValue,
                reference.satisfied ? null : styles.missingMetricValue,
              ]}
            >
              {reference.label}
            </Text>
            <Text style={styles.helperText}>Kind: {reference.evidenceKind}</Text>
            <Text style={styles.helperText}>{reference.detail}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.helperText}>No evidence expectations are declared on this template.</Text>
      )}

      <Text style={styles.sectionTitle}>Risk flags and justifications</Text>
      {report.riskFlags.length > 0 ? (
        report.riskFlags.map((item) => (
          <View
            key={item.id}
            style={[
              styles.metricCard,
              item.severity === 'submit-block' ? styles.missingMetricCard : null,
            ]}
          >
            <Text style={styles.metricLabel}>
              {item.severity === 'submit-block' ? 'Risco que bloqueia envio' : 'Risco visivel'}
            </Text>
            <Text
              style={[
                styles.metricValue,
                item.severity === 'submit-block' ? styles.missingMetricValue : null,
              ]}
            >
              {item.title}
            </Text>
            <Text style={styles.helperText}>{item.detail}</Text>
            <Text style={styles.helperText}>
              Justification:{' '}
              {item.justificationText.trim().length > 0
                ? item.justificationText.trim()
                : item.justificationRequired
                  ? 'Required but not entered yet.'
                  : 'Not required.'}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.helperText}>No visible risk flags are attached to this draft.</Text>
      )}

      <Text style={styles.sectionTitle}>Final notes and corrections</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={editable}
        multiline
        onChangeText={onReviewNotesChange}
        placeholder="Capture any final notes or corrections for the per-tag report draft."
        style={styles.input}
        value={report.reviewNotes}
      />
      <Text style={styles.helperText}>
        Last saved: {report.savedAt ? formatTimestamp(report.savedAt) : 'Not saved yet'}
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={!editable}
        onPress={onSaveReportDraft}
        style={[styles.primaryButton, !editable ? styles.buttonDisabled : null]}
      >
        <Text style={styles.primaryButtonLabel}>Salvar revisao do rascunho</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmitReport}
        style={[styles.secondaryButton, !canSubmit ? styles.buttonDisabled : null]}
      >
        <Text style={styles.secondaryButtonLabel}>Enviar localmente para sincronizar</Text>
      </Pressable>
    </View>
  );
}

function ExecutionGuidancePanel({
  evidence,
  guidance,
  editable,
  onAttachPhotoFromCamera,
  onAttachPhotoFromLibrary,
  onChecklistOutcomeChange,
  onObservationNotesChange,
  onRiskJustificationChange,
  onRemovePhotoAttachment,
  onSaveEvidence,
}: {
  evidence: SharedExecutionShell['evidence'];
  guidance: SharedExecutionShell['guidance'];
  editable: boolean;
  onAttachPhotoFromCamera: () => void;
  onAttachPhotoFromLibrary: () => void;
  onChecklistOutcomeChange: (
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) => void;
  onObservationNotesChange: (value: string) => void;
  onRiskJustificationChange: (riskItemId: string, justificationText: string) => void;
  onRemovePhotoAttachment: (evidenceId: string) => void;
  onSaveEvidence: () => void;
}) {
  return (
    <View style={styles.listCard}>
      <Text style={styles.metricLabel}>Guidance flow</Text>
      <Text style={styles.helperText}>
        Use the cached checklist and diagnosis prompts as lightweight field support. They stay
        visible, local, and non-blocking.
      </Text>
      {!editable ? (
        <Text style={styles.helperText}>
          Guidance evidence is locked because this per-tag report already entered the local sync queue.
        </Text>
      ) : null}

      <View
        style={[
          styles.metricCard,
          guidance.riskState === 'flagged' ? styles.missingMetricCard : null,
        ]}
      >
        <Text style={styles.metricLabel}>Risk hooks</Text>
        <Text
          style={[
            styles.metricValue,
            guidance.riskState === 'flagged' ? styles.missingMetricValue : null,
          ]}
        >
          {guidance.riskState === 'flagged'
            ? 'Visible risk flagged'
            : 'No visible risk flagged'}
        </Text>
        <Text style={styles.helperText}>
          {guidance.riskHooks.length > 0
            ? guidance.riskHooks.join(' ')
            : 'Missing context, history, checklist gaps, and evidence gaps can stay visible here without blocking local execution.'}
        </Text>
      </View>

      <View
        style={[
          styles.metricCard,
          guidance.submitReadiness === 'blocked' ? styles.missingMetricCard : null,
        ]}
      >
        <Text style={styles.metricLabel}>Pendencias antes do envio</Text>
        <Text
          style={[
            styles.metricValue,
            guidance.submitReadiness === 'blocked' ? styles.missingMetricValue : null,
          ]}
        >
          {guidance.submitReadiness === 'blocked'
            ? 'Existem riscos que bloqueiam o envio'
            : 'No submit-blocking hooks are active'}
        </Text>
        <Text style={styles.helperText}>
          {guidance.submitBlockingHooks.length > 0
            ? guidance.submitBlockingHooks.join(' ')
            : 'Visible risks can remain non-blocking as long as minimum evidence is present and required justifications are captured.'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Riscos visiveis e justificativas</Text>
      {guidance.riskItems.length > 0 ? (
        guidance.riskItems.map((item) => (
          <ExecutionRiskItemCard
            key={item.id}
            editable={editable}
            item={item}
            onJustificationChange={(value) => onRiskJustificationChange(item.id, value)}
          />
        ))
      ) : (
        <Text style={styles.helperText}>
          No visible risk is currently flagged for this local draft.
        </Text>
      )}

      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>Linked draft report</Text>
        <Text style={styles.metricValue}>{evidence.draftReportId}</Text>
        <Text style={styles.helperText}>
          State:{' '}
          {evidence.draftReportState === 'technician-owned-draft'
            ? 'technician-owned draft'
            : 'submitted - pending sync'}
          . Guidance evidence{' '}
          {editable ? 'remains editable locally until submission.' : 'is now locked locally.'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Observation notes</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={editable}
        multiline
        onChangeText={onObservationNotesChange}
        placeholder="Capture field observations, setup details, or anything the draft report should carry forward."
        style={styles.input}
        value={evidence.observationNotes}
      />
      <Text style={styles.helperText}>
        Last saved:{' '}
        {evidence.guidanceEvidenceUpdatedAt
          ? formatTimestamp(evidence.guidanceEvidenceUpdatedAt)
          : 'Not saved yet'}
      </Text>

      <Text style={styles.sectionTitle}>Draft report photo attachments</Text>
      <View style={styles.metricGrid}>
        <Pressable
          accessibilityRole="button"
          disabled={!editable}
          onPress={onAttachPhotoFromCamera}
          style={[styles.primaryButton, !editable ? styles.buttonDisabled : null]}
        >
          <Text style={styles.primaryButtonLabel}>Capture photo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!editable}
          onPress={onAttachPhotoFromLibrary}
          style={[styles.secondaryButton, !editable ? styles.buttonDisabled : null]}
        >
          <Text style={styles.secondaryButtonLabel}>Attach photo</Text>
        </Pressable>
      </View>
      <Text style={styles.helperText}>
        Photos are stored locally in the app sandbox and linked to the technician-owned draft
        report before sync.
      </Text>
      {evidence.photoAttachments.length > 0 ? (
        evidence.photoAttachments.map((attachment) => (
          <ExecutionPhotoAttachmentCard
            key={attachment.evidenceId}
            attachment={attachment}
            editable={editable}
            onRemove={() => onRemovePhotoAttachment(attachment.evidenceId)}
          />
        ))
      ) : (
        <Text style={styles.helperText}>No draft-report photo attachments have been saved yet.</Text>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!editable}
        onPress={onSaveEvidence}
        style={[styles.primaryButton, !editable ? styles.buttonDisabled : null]}
      >
        <Text style={styles.primaryButtonLabel}>Salvar notas, checklist e justificativas</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Checklist steps</Text>
      {guidance.checklistItems.length > 0 ? (
        guidance.checklistItems.map((item) => (
          <ExecutionChecklistCard
            key={item.id}
            item={item}
            editable={editable}
            onChecklistOutcomeChange={onChecklistOutcomeChange}
          />
        ))
      ) : (
        <Text style={styles.helperText}>No checklist steps are attached to this template.</Text>
      )}

      <Text style={styles.sectionTitle}>Guided diagnosis prompts</Text>
      {guidance.guidedDiagnosisPrompts.length > 0 ? (
        guidance.guidedDiagnosisPrompts.map((item) => (
          <GuidancePromptCard key={item.id} item={item} label="Diagnosis prompt" />
        ))
      ) : (
        <Text style={styles.helperText}>No guided diagnosis prompts are attached locally.</Text>
      )}

      <Text style={styles.sectionTitle}>Linked guidance references</Text>
      {guidance.linkedGuidance.length > 0 ? (
        guidance.linkedGuidance.map((item) => (
          <LinkedGuidanceCard key={item.id} item={item} />
        ))
      ) : (
        <Text style={styles.helperText}>No linked guidance references were cached for this tag.</Text>
      )}
    </View>
  );
}

function ExecutionPhotoAttachmentCard({
  attachment,
  editable,
  onRemove,
}: {
  attachment: SharedExecutionPhotoAttachment;
  editable: boolean;
  onRemove: () => void;
}) {
  const syncBadge = buildSyncStateBadgeModel(attachment.syncState, attachment.syncIssue);

  return (
    <View style={styles.photoAttachmentCard}>
      <Image source={{ uri: attachment.previewUri }} style={styles.photoAttachmentPreview} />
      <Text style={styles.metricLabel}>Draft report photo</Text>
      <Text style={styles.metricValue}>{attachment.fileName}</Text>
      <SyncStateBadge label={syncBadge.label} tone={syncBadge.tone} />
      <Text style={styles.helperText}>
        Source: {attachment.source === 'camera' ? 'Captured in app' : 'Attached from library'}.
      </Text>
      <Text style={styles.helperText}>{syncBadge.detail}</Text>
      <Text style={styles.helperText}>
        Saved: {formatTimestamp(attachment.updatedAt)}
      </Text>
      <Text style={styles.helperText}>
        Step: {attachment.executionStepId}. Resolution:{' '}
        {attachment.width && attachment.height
          ? `${attachment.width} x ${attachment.height}`
          : 'Unknown'}
        . Size:{' '}
        {attachment.fileSize !== null ? `${attachment.fileSize} bytes` : 'Unknown'}.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={!editable}
        onPress={onRemove}
        style={[styles.secondaryButton, !editable ? styles.buttonDisabled : null]}
      >
        <Text style={styles.secondaryButtonLabel}>Remove photo</Text>
      </Pressable>
    </View>
  );
}

function ExecutionChecklistCard({
  item,
  editable,
  onChecklistOutcomeChange,
}: {
  item: SharedExecutionChecklistItem;
  editable: boolean;
  onChecklistOutcomeChange: (
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) => void;
}) {
  return (
    <View
      style={[
        styles.metricCard,
        item.outcome === 'incomplete' || item.outcome === 'skipped'
          ? styles.missingMetricCard
          : null,
      ]}
    >
      <Text style={styles.metricLabel}>Checklist step</Text>
      <Text
        style={[
          styles.metricValue,
          item.outcome === 'incomplete' || item.outcome === 'skipped'
            ? styles.missingMetricValue
            : null,
        ]}
      >
        {item.prompt}
      </Text>
      <Text style={styles.helperText}>Why it matters: {item.whyItMatters}</Text>
      <Text style={styles.helperText}>Helps rule out: {item.helpsRuleOut}</Text>
      <Text style={styles.helperText}>Source: {item.sourceReference}</Text>
      <Text style={styles.helperText}>Status: {toChecklistOutcomeLabel(item.outcome)}</Text>

      <View style={styles.metricGrid}>
        <ChecklistOutcomeButton
          active={item.outcome === 'completed'}
          disabled={!editable}
          label="Complete"
          onPress={() => onChecklistOutcomeChange(item.id, 'completed')}
        />
        <ChecklistOutcomeButton
          active={item.outcome === 'incomplete'}
          disabled={!editable}
          label="Incomplete"
          onPress={() => onChecklistOutcomeChange(item.id, 'incomplete')}
        />
      </View>
      <View style={styles.metricGrid}>
        <ChecklistOutcomeButton
          active={item.outcome === 'skipped'}
          disabled={!editable}
          label="Skip"
          onPress={() => onChecklistOutcomeChange(item.id, 'skipped')}
        />
        <ChecklistOutcomeButton
          active={item.outcome === 'pending'}
          disabled={!editable}
          label="Reset"
          onPress={() => onChecklistOutcomeChange(item.id, 'pending')}
        />
      </View>
    </View>
  );
}

function ExecutionRiskItemCard({
  item,
  editable,
  onJustificationChange,
}: {
  item: SharedExecutionShell['guidance']['riskItems'][number];
  editable: boolean;
  onJustificationChange: (value: string) => void;
}) {
  const justificationMissing =
    item.justificationRequired && item.justificationText.trim().length === 0;

  return (
    <View
      style={[
        styles.metricCard,
        item.severity === 'submit-block' || justificationMissing
          ? styles.missingMetricCard
          : null,
      ]}
    >
      <Text style={styles.metricLabel}>
        {item.severity === 'submit-block' ? 'Risco que bloqueia envio' : 'Risco visivel'}
      </Text>
      <Text
        style={[
          styles.metricValue,
          item.severity === 'submit-block' || justificationMissing
            ? styles.missingMetricValue
            : null,
        ]}
      >
        {item.title}
      </Text>
      <Text style={styles.helperText}>{item.detail}</Text>
      {item.justificationRequired ? (
        <>
          <Text style={styles.helperText}>
            {item.justificationPrompt ?? 'Capture a field justification for this visible risk.'}
          </Text>
          <TextInput
            autoCapitalize="sentences"
            autoCorrect
            editable={editable}
            multiline
            onChangeText={onJustificationChange}
            placeholder="Enter the local field justification for this risk."
            style={styles.input}
            value={item.justificationText}
          />
        </>
      ) : (
        <Text style={styles.helperText}>
          Capture the missing minimum evidence before this draft is considered submission-ready.
        </Text>
      )}
    </View>
  );
}

function ChecklistOutcomeButton({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.secondaryButton,
        active ? styles.routeButtonActive : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[styles.secondaryButtonLabel, active ? styles.routeButtonLabelActive : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GuidancePromptCard({
  item,
  label,
}: {
  item: SharedExecutionGuidanceItem;
  label: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{item.prompt}</Text>
      <Text style={styles.helperText}>Why it matters: {item.whyItMatters}</Text>
      <Text style={styles.helperText}>Helps rule out: {item.helpsRuleOut}</Text>
      <Text style={styles.helperText}>Source: {item.sourceReference}</Text>
    </View>
  );
}

function LinkedGuidanceCard({
  item,
}: {
  item: SharedExecutionLinkedGuidanceSnippet;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>Linked guidance</Text>
      <Text style={styles.metricValue}>{item.title}</Text>
      <Text style={styles.helperText}>{item.summary}</Text>
      <Text style={styles.helperText}>Why it matters: {item.whyItMatters}</Text>
      <Text style={styles.helperText}>Source: {item.sourceReference}</Text>
    </View>
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatDueWindow(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return formatTimestamp(value);
}

function buildEmptyWorkPackageSyncSummary(workPackageId: string): WorkPackageSyncSummary {
  const badge = buildSyncStateBadgeModel('local-only');

  return {
    workPackageId,
    syncState: 'local-only',
    label: badge.label,
    detail: badge.detail,
    reportCount: 0,
    queueItemCount: 0,
    issueCount: 0,
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
  return `Sync retry checked ${summary.attempted} queued report(s): ${summary.succeeded} succeeded, ${summary.failed} kept queued.`;
}

// Story 8.11 finding #10 / #8: marker fences a visit-summary block inside
// the canonical report's observation notes. Re-submission detects the
// fence and rewrites the block in place so the notes never accumulate
// duplicate summaries.
const VISIT_SUMMARY_FENCE_START = '---VISIT-SUMMARY-START---';
const VISIT_SUMMARY_FENCE_END = '---VISIT-SUMMARY-END---';

function applyVisitSummaryAugmentation(
  existingNotes: string,
  visitSummary: string,
): string {
  const trimmedExisting = existingNotes ?? '';
  const fenceStart = trimmedExisting.indexOf(VISIT_SUMMARY_FENCE_START);
  const fenceEnd = trimmedExisting.indexOf(VISIT_SUMMARY_FENCE_END);

  const block = `${VISIT_SUMMARY_FENCE_START}\n${visitSummary}\n${VISIT_SUMMARY_FENCE_END}`;

  if (fenceStart !== -1 && fenceEnd !== -1 && fenceEnd > fenceStart) {
    const before = trimmedExisting.slice(0, fenceStart).trimEnd();
    const after = trimmedExisting
      .slice(fenceEnd + VISIT_SUMMARY_FENCE_END.length)
      .trimStart();
    return [before, block, after].filter((piece) => piece.length > 0).join('\n\n');
  }

  return trimmedExisting.length > 0 ? `${trimmedExisting.trimEnd()}\n\n${block}` : block;
}

function formatVisitSummaryForObservationNotes(view: InstrumentVisitView): string {
  const lines = [`Tag ${view.tagCode}: ${view.templates.length} teste(s) nesta visita.`];
  for (const entry of view.templates) {
    const status =
      entry.acceptance === 'pass'
        ? 'OK'
        : entry.acceptance === 'fail'
        ? 'FALHA'
        : 'em andamento';
    const expected = entry.expectedValueLabel || '-';
    const observed = entry.observedValueLabel || '-';
    const unit = entry.unit ? ` ${entry.unit}` : '';
    const deviation =
      entry.signedDeviation !== null
        ? ` desvio ${entry.signedDeviation > 0 ? '+' : ''}${entry.signedDeviation.toFixed(3).replace(/\.?0+$/, '')}${unit}`
        : '';
    const span =
      entry.percentOfSpan !== null
        ? ` (${entry.percentOfSpan > 0 ? '+' : ''}${entry.percentOfSpan.toFixed(2)}% span)`
        : '';
    lines.push(
      `- ${entry.templateTitle} [${status}]: esperado ${expected}${unit}, medido ${observed}${unit}${deviation}${span}`,
    );
    if (entry.acceptanceReason) {
      lines.push(`    motivo: ${entry.acceptanceReason}`);
    }
  }
  return lines.join('\n');
}

function formatDeviation(value: number, unit: string | null) {
  const formatted = value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return unit ? `${formatted} ${unit}` : formatted;
}

function toAcceptanceLabel(value: 'pass' | 'fail' | 'unavailable') {
  switch (value) {
    case 'pass':
      return 'Pass';
    case 'fail':
      return 'Fail';
    default:
      return 'Unavailable';
  }
}

function toChecklistOutcomeLabel(value: SharedExecutionChecklistOutcome) {
  switch (value) {
    case 'completed':
      return 'Completed';
    case 'incomplete':
      return 'Incomplete';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Pendente';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f4',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
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
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#dce3da',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#d9f99d',
    color: '#365314',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: '#0f172a',
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
  },
  routeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  routeButton: {
    flex: 1,
    flexBasis: '45%',
    borderRadius: 14,
    backgroundColor: '#e7ece8',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  routeButtonActive: {
    backgroundColor: '#0f766e',
  },
  routeButtonLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  routeButtonLabelActive: {
    color: '#f8fafc',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: '#dce3da',
  },
  messageCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  panelBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f8faf9',
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5ece8',
  },
  missingMetricCard: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  missingMetricValue: {
    color: '#b91c1c',
  },
  syncBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  syncBadge_neutral: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  syncBadge_waiting: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  syncBadge_active: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  syncBadge_success: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  syncBadge_attention: {
    backgroundColor: '#fff7f7',
    borderColor: '#fca5a5',
  },
  syncBadgeLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  syncBadgeLabel_neutral: {
    color: '#334155',
  },
  syncBadgeLabel_waiting: {
    color: '#92400e',
  },
  syncBadgeLabel_active: {
    color: '#1d4ed8',
  },
  syncBadgeLabel_success: {
    color: '#166534',
  },
  syncBadgeLabel_attention: {
    color: '#b91c1c',
  },
  primaryButton: {
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: '#f8fafc',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButtonLabel: {
    color: '#0f172a',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  listCard: {
    backgroundColor: '#f8faf9',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5ece8',
  },
  photoAttachmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#dce3da',
  },
  photoAttachmentPreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: '#e5ece8',
  },
  listCardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  cameraCard: {
    gap: 10,
  },
  cameraViewport: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
