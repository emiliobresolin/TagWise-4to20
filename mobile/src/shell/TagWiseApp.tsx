import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { DeterministicCalculationInputError } from '../features/execution/deterministicCalculationEngine';
import {
  canProceedToExecutionShell,
  resolveExplicitExecutionTemplateSelection,
} from '../features/execution/executionTemplateSelection';
import { SharedExecutionShellService } from '../features/execution/sharedExecutionShellService';
import type {
  SharedExecutionChecklistItem,
  SharedExecutionChecklistOutcome,
  SharedExecutionField,
  SharedExecutionGuidanceItem,
  SharedExecutionLinkedGuidanceSnippet,
  SharedExecutionPhotoAttachment,
  SharedExecutionShell,
} from '../features/execution/model';
import { AssignedWorkPackageCatalogService } from '../features/work-packages/assignedWorkPackageCatalogService';
import { LocalTagContextService } from '../features/work-packages/localTagContextService';
import { LocalTagEntryService } from '../features/work-packages/localTagEntryService';
import {
  LocalQrScanService,
  type LocalQrScanResult,
} from '../features/work-packages/localQrScanService';
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
import { createSecureStorageBoundary } from '../platform/secure-storage/secureStorageBoundary';
import { createPhotoAcquisitionBoundary } from '../platform/media/photoAcquisitionBoundary';
import { closeRuntimeIfInactive } from './runtimeCleanup';

const photoAcquisitionBoundary = createPhotoAcquisitionBoundary();

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
      workPackageCatalog: AssignedWorkPackageCatalogService;
      localTagEntryService: LocalTagEntryService;
      localTagContextService: LocalTagContextService;
      executionShellService: SharedExecutionShellService;
      session: ActiveUserSession | null;
      localOwnership: LocalOwnershipProofSnapshot | null;
      authBusy: boolean;
      packageBusy: boolean;
      authMessage: string | null;
      activeTagPackageId: string | null;
      selectedExecutionTemplateId: string | null;
      tagSearchQuery: string;
      visibleTags: LocalAssignedTagEntry[];
      selectedTag: LocalAssignedTagEntry | null;
      selectedTagContext: LocalTagContext | null;
      executionShell: SharedExecutionShell | null;
      qrScannerVisible: boolean;
      qrManualPayload: string;
      qrScanResult: LocalQrScanResult | null;
      qrScanService: LocalQrScanService;
    };

const placeholderRoutes = [
  { key: 'foundation' as const, label: 'Foundation' },
  { key: 'packages' as const, label: 'Packages' },
  { key: 'storage' as const, label: 'Storage' },
];

export function TagWiseApp() {
  const [status, setStatus] = useState<BootstrapStatus>({ type: 'loading' });
  const [email, setEmail] = useState('tech@tagwise.local');
  const [password, setPassword] = useState('TagWise123!');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

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
          workPackageCatalog,
          localTagEntryService,
          localTagContextService,
          executionShellService,
          session,
          localOwnership,
          authBusy: false,
          packageBusy: false,
          authMessage:
            restoredSession.state === 'signed_in' && session?.connectionMode === 'offline'
              ? 'Offline session restored from cached role metadata.'
              : null,
          activeTagPackageId: null,
          selectedExecutionTemplateId: null,
          tagSearchQuery: '',
          visibleTags: [],
          selectedTag: null,
          selectedTagContext: null,
          executionShell: null,
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
            authMessage: 'Owned local draft, evidence metadata, queue placeholder, and sandbox file updated.',
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
      let authMessage = 'Connected session established and cached for offline restore.';

      try {
        workPackages = await readyState.workPackageCatalog.refreshConnectedCatalog(session);
        authMessage = `Connected session established and ${workPackages.length} assigned package(s) loaded.`;
      } catch (packageError) {
        authMessage = `${authMessage} Assigned packages could not be refreshed: ${
          packageError instanceof Error ? packageError.message : 'Unknown package refresh error.'
        }`;
      }

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              session,
              localOwnership,
              workPackages,
              authBusy: false,
              authMessage,
              activeTagPackageId: null,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags: [],
              selectedTag: null,
              selectedTagContext: null,
              executionShell: null,
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
                error instanceof Error ? error.message : 'Connected authentication failed.',
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
      const workPackages = await readyState.workPackageCatalog.refreshConnectedCatalog(
        readyState.session,
      );
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              workPackages,
              packageBusy: false,
              authMessage: `${workPackages.length} assigned package(s) refreshed for offline use.`,
              activeTagPackageId: null,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags: [],
              selectedTag: null,
              selectedTagContext: null,
              executionShell: null,
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
                  : 'Assigned package refresh failed without a detailed message.',
            },
      );
    }
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
      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              workPackages: result.summaries,
              packageBusy: false,
              authMessage: `Assigned package ${result.snapshot.summary.id} snapshot stored locally and freshness updated.`,
              activeTagPackageId: null,
              selectedExecutionTemplateId: null,
              tagSearchQuery: '',
              visibleTags: [],
              selectedTag: null,
              selectedTagContext: null,
              executionShell: null,
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

  async function handleBrowsePackageTags(workPackageId: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    const visibleTags = await readyState.localTagEntryService.listPackageTags(
      readyState.session,
      workPackageId,
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

  async function openTagContext(entry: LocalAssignedTagEntry) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
    }

    const selectedTagContext = await readyState.localTagContextService.getTagContext(
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
            executionShell: null,
            authMessage: selectedTagContext
              ? `Tag context loaded locally for ${entry.tagCode}.`
              : 'Selected tag context is not available in local storage.',
          },
    );
  }

  async function handleOpenTag(tagId: string) {
    if (status.type !== 'ready' || !readyState.session || !readyState.activeTagPackageId) {
      return;
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
              authMessage: 'Selected tag is no longer available in local package scope.',
            },
      );
      return;
    }

    await openTagContext(selectedTag);
  }

  async function handleProceedToExecutionShell() {
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
      return;
    }

    const executionShell = await readyState.executionShellService.loadShell(
      readyState.session,
      readyState.selectedTag.workPackageId,
      readyState.selectedTag.tagId,
      selectedTemplateId,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
          : {
              ...current,
              executionShell,
              authMessage: executionShell
                ? `Shared execution shell loaded for ${executionShell.tagCode} using ${executionShell.template.testPattern}.`
                : 'No local template contract is available for this tag.',
          },
    );
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
      current.executionShell.report.state !== 'technician-owned-draft'
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
      current.executionShell.report.state !== 'technician-owned-draft'
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
      current.executionShell.report.state !== 'technician-owned-draft'
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
      current.executionShell.report.state !== 'technician-owned-draft'
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
      current.executionShell.report.state !== 'technician-owned-draft'
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
      readyState.executionShell.report.state !== 'technician-owned-draft'
    ) {
      return;
    }

    try {
      const executionShell = await readyState.executionShellService.saveCalculation(
        readyState.session,
        readyState.executionShell,
        readyState.executionShell.calculation.rawInputs,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionShell,
              authMessage: executionShell.calculation?.result
                ? `Deterministic calculation saved locally for ${executionShell.tagCode}.`
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
      readyState.executionShell.report.state !== 'technician-owned-draft'
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.saveGuidanceEvidence(
      readyState.session,
      readyState.executionShell,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            authMessage: `Structured execution evidence saved locally for ${executionShell.tagCode}.`,
          },
    );
  }

  async function handleAttachExecutionPhoto(source: 'camera' | 'library') {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      readyState.executionShell.report.state !== 'technician-owned-draft'
    ) {
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

      const executionShell = await readyState.executionShellService.attachPhotoEvidence(
        readyState.session,
        readyState.executionShell,
        photo,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionShell,
              authMessage: `Photo attachment saved locally for ${executionShell.tagCode}.`,
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
      readyState.executionShell.report.state !== 'technician-owned-draft'
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.removePhotoEvidence(
      readyState.session,
      readyState.executionShell,
      evidenceId,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            authMessage: `Photo attachment removed locally for ${executionShell.tagCode}.`,
          },
    );
  }

  async function handleSaveReportDraft() {
    if (
      status.type !== 'ready' ||
      !readyState.session ||
      !readyState.executionShell ||
      readyState.executionShell.report.state !== 'technician-owned-draft'
    ) {
      return;
    }

    const executionShell = await readyState.executionShellService.saveReportDraft(
      readyState.session,
      readyState.executionShell,
    );

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            executionShell,
            authMessage: `Per-tag report draft saved locally for ${executionShell.tagCode}.`,
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
                'Grant camera access or paste the QR payload below to resolve it locally.',
            },
          },
    );
  }

  async function handleResolveQrPayload(rawPayload: string) {
    if (status.type !== 'ready' || !readyState.session) {
      return;
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
      return;
    }

    setStatus((current) =>
      current.type !== 'ready'
        ? current
        : {
            ...current,
            qrScannerVisible: false,
            qrScanResult,
            activeTagPackageId: null,
            selectedExecutionTemplateId: null,
            tagSearchQuery: '',
            visibleTags: [],
            selectedTag: null,
            selectedTagContext: null,
            executionShell: null,
            authMessage: null,
          },
    );
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

  async function handleResolveManualQrPayload() {
    if (status.type !== 'ready') {
      return;
    }

    await handleResolveQrPayload(readyState.qrManualPayload);
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

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              diagnostics,
              authMessage: `Captured local diagnostic event ${captured.id}.`,
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
            workPackages: result.state === 'cleared' ? [] : current.workPackages,
            activeTagPackageId: result.state === 'cleared' ? null : current.activeTagPackageId,
            selectedExecutionTemplateId:
              result.state === 'cleared' ? null : current.selectedExecutionTemplateId,
            tagSearchQuery: result.state === 'cleared' ? '' : current.tagSearchQuery,
            visibleTags: result.state === 'cleared' ? [] : current.visibleTags,
            selectedTag: result.state === 'cleared' ? null : current.selectedTag,
            selectedTagContext: result.state === 'cleared' ? null : current.selectedTagContext,
            executionShell: result.state === 'cleared' ? null : current.executionShell,
            qrScannerVisible: result.state === 'cleared' ? false : current.qrScannerVisible,
            qrManualPayload: result.state === 'cleared' ? '' : current.qrManualPayload,
            qrScanResult: result.state === 'cleared' ? null : current.qrScanResult,
            authMessage:
              result.state === 'cleared'
                ? 'Session cleared. Connected sign-in is required for the next user.'
                : result.message ?? 'User switch blocked.',
          },
      );
  }

  async function handleSubmitExecutionReport() {
    if (status.type !== 'ready' || !readyState.session || !readyState.executionShell) {
      return;
    }

    try {
      const executionShell = await readyState.executionShellService.submitReport(
        readyState.session,
        readyState.executionShell,
      );

      setStatus((current) =>
        current.type !== 'ready'
          ? current
          : {
              ...current,
              executionShell,
              authMessage: `Per-tag report queued locally for sync for ${executionShell.tagCode}.`,
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
                  : 'Local report submission failed without a detailed message.',
            },
      );
    }
  }

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
            {readyState.session ? 'Authenticated local shell' : 'Connected sign-in required'}
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
            <Text style={styles.panelTitle}>Connected sign-in</Text>
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
                {readyState.authBusy ? 'Signing in...' : 'Sign in'}
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
                  {readyState.authBusy ? 'Checking session...' : 'Switch user'}
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
                    {readyState.packageBusy ? 'Refreshing packages...' : 'Refresh assigned packages'}
                  </Text>
                </Pressable>

                <Text style={styles.helperText}>
                  {readyState.session.connectionMode === 'connected'
                    ? 'Connected mode can refresh the assigned package list and download snapshots.'
                    : 'Offline mode can open downloaded packages later, but refresh/download remains unavailable until reconnection.'}
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
                    No assigned packages are cached on this device yet. Refresh while connected to
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
                            editable={
                              readyState.executionShell.report.state === 'technician-owned-draft'
                            }
                            onReviewNotesChange={handleReportReviewNotesChange}
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
                            <Text style={styles.secondaryButtonLabel}>Open tag</Text>
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

                  return (
                    <View key={workPackage.id} style={styles.listCard}>
                    <Text style={styles.listCardTitle}>{workPackage.title}</Text>
                    <Text style={styles.helperText}>
                      {workPackage.id} / {workPackage.sourceReference}
                    </Text>

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

                    <Text style={styles.helperText}>{readiness.detail}</Text>

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
                      <Text style={styles.secondaryButtonLabel}>Browse cached tags</Text>
                    </Pressable>
                    </View>
                  );
                })}
              </View>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
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
  editable,
  onReviewNotesChange,
  onSaveReportDraft,
  onSubmitReport,
}: {
  report: SharedExecutionShell['report'];
  editable: boolean;
  onReviewNotesChange: (value: string) => void;
  onSaveReportDraft: () => void;
  onSubmitReport: () => void;
}) {
  const canSubmit = editable && report.lifecycleState === 'Ready to Submit';

  return (
    <View style={styles.listCard}>
      <Text style={styles.metricLabel}>Per-tag report draft</Text>
      <Text style={styles.helperText}>
        This summary is assembled from captured local execution work so the technician reviews the
        draft instead of retyping the field session.
      </Text>
      {!editable ? (
        <Text style={styles.helperText}>
          This report was already submitted locally and queued for sync. Execution evidence and
          final notes are now locked until a later lifecycle story changes the state.
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
          Sync state: {report.syncState === 'queued' ? 'Queued' : 'Local Only'}
        </Text>
        <Text style={styles.helperText}>
          Submitted locally: {report.submittedAt ? formatTimestamp(report.submittedAt) : 'Not submitted yet'}
        </Text>
      </View>

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
              {item.severity === 'submit-block' ? 'Submit-blocking risk' : 'Visible risk'}
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
        <Text style={styles.primaryButtonLabel}>Save draft report review</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmitReport}
        style={[styles.secondaryButton, !canSubmit ? styles.buttonDisabled : null]}
      >
        <Text style={styles.secondaryButtonLabel}>Submit locally for sync</Text>
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
        <Text style={styles.metricLabel}>Submit readiness hooks</Text>
        <Text
          style={[
            styles.metricValue,
            guidance.submitReadiness === 'blocked' ? styles.missingMetricValue : null,
          ]}
        >
          {guidance.submitReadiness === 'blocked'
            ? 'Submit-blocking hooks are still active'
            : 'No submit-blocking hooks are active'}
        </Text>
        <Text style={styles.helperText}>
          {guidance.submitBlockingHooks.length > 0
            ? guidance.submitBlockingHooks.join(' ')
            : 'Visible risks can remain non-blocking as long as minimum evidence is present and required justifications are captured.'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Visible risks and justifications</Text>
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
        <Text style={styles.primaryButtonLabel}>Save notes, checklist, and justifications</Text>
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
  return (
    <View style={styles.photoAttachmentCard}>
      <Image source={{ uri: attachment.previewUri }} style={styles.photoAttachmentPreview} />
      <Text style={styles.metricLabel}>Draft report photo</Text>
      <Text style={styles.metricValue}>{attachment.fileName}</Text>
      <Text style={styles.helperText}>
        Source: {attachment.source === 'camera' ? 'Captured in app' : 'Attached from library'}.
      </Text>
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
        {item.severity === 'submit-block' ? 'Submit-blocking risk' : 'Visible risk'}
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
      return 'Pending';
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
    gap: 10,
  },
  routeButton: {
    flex: 1,
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
