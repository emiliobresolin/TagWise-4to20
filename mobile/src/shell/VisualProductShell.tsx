import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppLanguage } from '../i18n';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ActiveUserSession } from '../features/auth/model';
import type {
  SharedExecutionChecklistOutcome,
  SharedExecutionLoopReadingPoint,
  SharedExecutionPhotoAttachment,
  SharedExecutionShell,
  SharedExecutionStepKind,
} from '../features/execution/model';
import type {
  InstrumentVisitView,
  SharedExecutionTemplateStatus,
} from '../features/execution/sharedExecutionShellService';
import {
  buildTechnicianVisualWorkflow,
  isVisualDemoShellEnabled,
  type VisualHistoryPoint,
  type VisualSeverity,
  type VisualTagCategory,
  type VisualTagIdentity,
  type VisualTagSummary,
} from '../features/visual-shell/model';
import {
  visualShellColors as colors,
  visualShellRadius as radius,
  visualShellSpacing as spacing,
  visualShellTypography as type,
} from '../features/visual-shell/designSystem';
import {
  resolveServiceBackedVisualTagIdentity,
  shouldOpenVisualDetailForQrResult,
} from '../features/visual-shell/serviceBackedNavigation';
import {
  buildVisualExecutionCalculation,
  buildVisualExecutionGuidance,
  buildVisualExecutionHistory,
  buildVisualHistoryPointOptions,
  convertLoopValue,
  type VisualExecutionCalculationViewModel,
  type VisualExecutionGuidanceViewModel,
  type VisualExecutionHistoryViewModel,
  type VisualHistoryPointOption,
  type VisualLoopConversionMode,
  type VisualLoopConversionResult,
} from '../features/visual-shell/serviceBackedExecution';
import {
  buildVisualReportProjection,
  classifySyncError,
  createVisualReportActions,
  formatPhotoContextSubtitle,
  formatPhotoExecutionStepLabel,
  type VisualAiDiagnosisProjectionInput,
  type VisualReportProjection,
  type VisualReportPendingActionRoute,
} from '../features/visual-shell/serviceBackedReport';
import {
  buildVisualWorkPackagePreparation,
  type VisualWorkPackagePreparationProjection,
} from '../features/visual-shell/serviceBackedPackages';
import {
  buildVisualReviewAccess,
  buildVisualReviewDecisionFeedback,
  buildVisualReviewDecisionRequest,
  buildVisualReviewDetailProjection,
  buildVisualReviewQueueGroups,
  createVisualReviewDecisionActions,
  type VisualReviewDecisionKind,
  type VisualReviewDecisionRequest,
  type VisualReviewDetailProjection,
  type VisualReviewQueueGroup,
  type VisualReviewQueueGroupKey,
} from '../features/visual-shell/serviceBackedReview';
import {
  calculateFieldValue,
  calculateLoopTest,
  buildCalculatorApplyTargets,
  createDefaultLoopPoints,
  formatLoopTestEvidenceNote,
  normalizeLoopPointCount,
  updateLoopPoint,
  type FieldCalculatorMode,
  type FieldCalculatorInput,
  type LoopPointInputMode,
  type LoopTestPoint,
} from '../features/visual-shell/fieldCalculator';
import {
  buildExecutionStages,
  resolveVisualExecutionPattern,
  shouldScrollRouteToTop,
  toPtBrTemplateLabel,
  type VisualExecutionStage,
  type VisualExecutionRoute,
} from '../features/visual-shell/executionFlow';
import {
  buildTagWorkStatus,
  type VisualTechnicianReportSummary,
  type VisualTagWorkStatus,
} from '../features/visual-shell/technicianReports';
import type { ReportSyncDetail } from '../features/sync/syncStateService';
import type {
  SupervisorReviewQueueItem,
  SupervisorReviewReportDetail,
} from '../features/review/model';
import type {
  LocalAssignedTagEntry,
  LocalAssignedWorkPackageSummary,
  LocalTagContext,
  LocalTagPriorTestReading,
} from '../features/work-packages/model';
import type { ManualInstrumentInput } from '../features/work-packages/manualInstrumentModel';
import type { LocalQrScanResult } from '../features/work-packages/localQrScanService';

class ShellErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#07101d', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Erro inesperado / Unexpected error
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
            {this.state.error?.message ?? 'Reinicie o aplicativo.'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

type VisualRoute =
  | 'dashboard'
  | 'detail'
  | 'manual-intake'
  | 'calculator'
  | 'reports'
  | 'calculation'
  | 'loop-test'
  | 'history'
  | 'diagnosis'
  | 'report'
  | 'review'
  | 'approval';

type VisualStageRoute = VisualExecutionRoute | 'history' | 'report' | 'detail';

function createEmptyManualInstrumentDraft(): ManualInstrumentInput {
  return {
    tagCode: '',
    description: '',
    area: '',
    instrumentFamily: '',
    instrumentSubtype: '',
    measuredVariable: '',
    signalType: '',
    rangeMin: '',
    rangeMax: '',
    unit: '',
    tolerance: '',
    reason: '',
    notes: '',
  };
}

function createEmptyFieldCalculatorDraft(): FieldCalculatorInput {
  return {
    mode: 'pv-to-ma',
    value: '',
    processMin: '',
    processMax: '',
    unit: '',
    expected: '',
    measured: '',
    tolerance: '',
  };
}

export interface VisualProductShellProps {
  session: ActiveUserSession | null;
  authBusy: boolean;
  packageBusy: boolean;
  authMessage: string | null;
  email: string;
  password: string;
  apiBaseUrl: string;
  workPackages: LocalAssignedWorkPackageSummary[];
  visibleTags: LocalAssignedTagEntry[];
  technicianReports: VisualTechnicianReportSummary[];
  selectedTag: LocalAssignedTagEntry | null;
  selectedTagContext: LocalTagContext | null;
  selectedExecutionTemplateId: string | null;
  executionShell: SharedExecutionShell | null;
  // Story 8.11: per-template saved status badges (Concluido / Falha /
  // Iniciar) that the detail screen renders alongside each template.
  executionTemplateStatuses: readonly SharedExecutionTemplateStatus[];
  // Story 8.11 finding #10: aggregated visit view consumed by the Report
  // screen so the technician sees ONE relatorio per tag instead of one
  // per template.
  instrumentVisit: InstrumentVisitView | null;
  reportSyncDetail: ReportSyncDetail | null;
  // Story 8.9 D-01: AI diagnosis projections for the technician report
  // screen and the supervisor review detail. Both default to null when the
  // backend has not provided a state; the projection adapters then fall
  // back to the hardcoded 'unavailable' input.
  executionAiDiagnosis: VisualAiDiagnosisProjectionInput | null;
  supervisorAiDiagnosis: VisualAiDiagnosisProjectionInput | null;
  syncBusy: boolean;
  reviewBusy: boolean;
  supervisorReviewQueue: SupervisorReviewQueueItem[];
  selectedSupervisorReviewReport: SupervisorReviewReportDetail | null;
  supervisorReturnComment: string;
  supervisorEscalationRationale: string;
  qrScannerVisible: boolean;
  qrManualPayload: string;
  qrScanResult: LocalQrScanResult | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
  onSwitchUser: () => void;
  onRefreshPackages: () => void;
  // Story 10.7 (issue follow-up): one-tap "Sincronizar com servidor" that
  // refreshes everything that could be stale (packages + in-flight reports
  // + supervisor queue when applicable). Optional so test harnesses that
  // build the shell without this handler still typecheck.
  onSyncWithServer?: () => void;
  onDownloadPackage: (workPackageId: string) => Promise<void>;
  // Story 8.13: delete a single locally-cached package so the
  // technician can re-download fresh data. Used after seed changes.
  onDeleteLocalPackage: (workPackageId: string) => Promise<void>;
  onBrowsePackageTags: (workPackageId: string) => Promise<void>;
  onCreateManualInstrument: (input: ManualInstrumentInput) => Promise<boolean>;
  onOpenTechnicianReport: (report: VisualTechnicianReportSummary) => Promise<boolean>;
  onOpenTag: (identity: VisualTagIdentity) => Promise<boolean>;
  onStartQrScanner: () => void;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
  onQrManualPayloadChange: (value: string) => void;
  onResolveQrManualPayload: () => Promise<LocalQrScanResult | null>;
  onCancelQrScanner: () => void;
  onSelectExecutionTemplate: (templateId: string) => void;
  onOpenExecutionTemplate: (templateId: string) => Promise<boolean>;
  onProceedToExecutionShell: () => Promise<boolean>;
  onCalculationInputChange: (
    key: 'expectedValue' | 'observedValue',
    value: string,
  ) => void;
  onSaveCalculation: () => Promise<void>;
  onChecklistOutcomeChange: (
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) => void;
  onObservationNotesChange: (value: string) => void;
  onRiskJustificationChange: (riskItemId: string, justificationText: string) => void;
  onSaveGuidanceEvidence: () => Promise<void>;
  onSaveLoopTestNote: (note: string) => Promise<void>;
  // Story 8.15: persist the per-point detail of the loop test so the
  // loop screen rehydrates on next entry and the Report screen can
  // render a formatted results section.
  onSaveLoopTestEvidence: (input: {
    points: SharedExecutionLoopReadingPoint[];
    inputMode: 'pv' | 'ma';
    worstCase: { rawInputs: { expectedValue: string; observedValue: string } } | null;
  }) => Promise<void>;
  onReportReviewNotesChange: (value: string) => void;
  onSaveReportDraft: () => Promise<void>;
  // Story 8.7 AC 7: the optional `contextNote` carries sub-step context (e.g.
  // "Ponto de loop 50%") so a photo taken during a loop test point can be
  // labeled correctly in the report evidence area.
  // Story 8.8 D-03 / D-04: optional `options.technicianNote` and
  // `options.executionStepIdOverride` allow per-photo technician comments and
  // instrument-level (tag-detail-screen) photos.
  onAttachReportPhoto: (
    source: 'camera' | 'library',
    contextNote?: string | null,
    options?: {
      technicianNote?: string | null;
      executionStepIdOverride?: SharedExecutionStepKind;
    },
  ) => Promise<void>;
  onRemoveReportPhoto: (evidenceId: string) => Promise<void>;
  onUpdatePhotoTechnicianNote: (evidenceId: string, note: string | null) => Promise<void>;
  onSubmitReport: () => Promise<void>;
  onRetryReportSync: () => Promise<void>;
  onRefreshReportServerStatus: () => Promise<void>;
  // Story 8.9 D-01: technician taps "Solicitar diagnostico assistido" on
  // the report screen. The handler enqueues a worker job server-side and
  // refreshes the local AI projection. AI failures are non-blocking.
  onRequestExecutionAiDiagnosis: () => Promise<void>;
  onRefreshSupervisorReviewQueue: () => Promise<void>;
  onOpenSupervisorReviewReport: (reportId: string) => Promise<void>;
  onCloseSupervisorReviewReport: () => void;
  onApproveSupervisorReviewReport: (reportId: string) => Promise<void>;
  onReturnSupervisorReviewReport: (reportId: string) => Promise<void>;
  onEscalateSupervisorReviewReport: (reportId: string) => Promise<void>;
  onSupervisorReturnCommentChange: (value: string) => void;
  onSupervisorEscalationRationaleChange: (value: string) => void;
  // Story 9.4: open the supervisor authoring overlay (Create work package).
  // Optional so existing tests / harnesses that build a shell without the
  // authoring service still typecheck.
  onOpenSupervisorAuthoring?: () => void;
  // i18n: current app language and language change handler.
  appLanguage?: AppLanguage;
  // NetInfo: null = unknown, true = online, false = offline.
  networkOnline?: boolean | null;
  onLanguageChange?: (language: AppLanguage) => void;
  // Handler to start a new visit after a report is invalidated/returned.
  onStartNewVisit?: () => void;
}

export function VisualProductShell({
  session,
  authBusy,
  packageBusy,
  authMessage,
  email,
  password,
  apiBaseUrl,
  workPackages,
  visibleTags,
  technicianReports,
  selectedTag: selectedLocalTag,
  selectedTagContext,
  selectedExecutionTemplateId,
  executionShell,
  executionTemplateStatuses,
  instrumentVisit,
  reportSyncDetail,
  executionAiDiagnosis,
  supervisorAiDiagnosis,
  syncBusy,
  reviewBusy,
  supervisorReviewQueue,
  selectedSupervisorReviewReport,
  supervisorReturnComment,
  supervisorEscalationRationale,
  qrScannerVisible,
  qrManualPayload,
  qrScanResult,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSwitchUser,
  onRefreshPackages,
  onSyncWithServer,
  onDownloadPackage,
  onDeleteLocalPackage,
  onBrowsePackageTags,
  onCreateManualInstrument,
  onOpenTechnicianReport,
  onOpenTag,
  onStartQrScanner,
  onBarcodeScanned,
  onQrManualPayloadChange,
  onResolveQrManualPayload,
  onCancelQrScanner,
  onSelectExecutionTemplate,
  onOpenExecutionTemplate,
  onProceedToExecutionShell,
  onCalculationInputChange,
  onSaveCalculation,
  onChecklistOutcomeChange,
  onObservationNotesChange,
  onRiskJustificationChange,
  onSaveGuidanceEvidence,
  onSaveLoopTestNote,
  onSaveLoopTestEvidence,
  onReportReviewNotesChange,
  onSaveReportDraft,
  onAttachReportPhoto,
  onRemoveReportPhoto,
  onUpdatePhotoTechnicianNote,
  onSubmitReport,
  onRetryReportSync,
  onRefreshReportServerStatus,
  onRequestExecutionAiDiagnosis,
  onRefreshSupervisorReviewQueue,
  onOpenSupervisorReviewReport,
  onCloseSupervisorReviewReport,
  onApproveSupervisorReviewReport,
  onReturnSupervisorReviewReport,
  onEscalateSupervisorReviewReport,
  onSupervisorReturnCommentChange,
  onSupervisorEscalationRationaleChange,
  onOpenSupervisorAuthoring,
  appLanguage,
  networkOnline,
  onLanguageChange,
  onStartNewVisit,
}: VisualProductShellProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [route, setRoute] = useState<VisualRoute>('dashboard');
  // Story 8.7 AC 8: maintain an in-app route history stack so the Android
  // hardware back button and the visible Voltar affordance can navigate back
  // through the user's screen history before falling through to the OS minimize.
  const routeHistoryRef = useRef<VisualRoute[]>([]);
  const [activeFilter, setActiveFilter] = useState<VisualTagCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDemoTag, setSelectedDemoTag] = useState<VisualTagSummary | null>(null);
  const [selectedSymptom, setSelectedSymptom] = useState('Sem Resposta');
  const [justification, setJustification] = useState('');
  const [manualInstrumentDraft, setManualInstrumentDraft] = useState<ManualInstrumentInput>(
    createEmptyManualInstrumentDraft,
  );
  const [fieldCalculatorDraft, setFieldCalculatorDraft] = useState<FieldCalculatorInput>(
    createEmptyFieldCalculatorDraft,
  );
  const [calculatorReturnRoute, setCalculatorReturnRoute] = useState<VisualRoute>('dashboard');
  const [loopInputMode, setLoopInputMode] = useState<LoopPointInputMode>('pv');
  const [loopPoints, setLoopPoints] = useState<LoopTestPoint[]>(() => createDefaultLoopPoints());

  // Story 8.15: when the active execution shell carries persisted
  // loopReadings (from a previous save of this template), rehydrate
  // loopPoints + inputMode so the loop screen shows the saved curve
  // when the technician re-opens the template. We key on the
  // (template, updatedAt) pair so successive saves on the same
  // template overwrite local state cleanly without clobbering a
  // mid-edit session from the user.
  const loopReadingsHydrationKey = useMemo(() => {
    const persisted = executionShell?.evidence.loopReadings ?? [];
    if (persisted.length === 0) return null;
    return `${executionShell?.template.id ?? ''}:${executionShell?.evidence.loopUpdatedAt ?? ''}`;
  }, [executionShell?.template.id, executionShell?.evidence.loopUpdatedAt, executionShell?.evidence.loopReadings]);
  useEffect(() => {
    if (!loopReadingsHydrationKey || !executionShell) return;
    const persisted = executionShell.evidence.loopReadings;
    if (persisted.length === 0) return;
    setLoopInputMode(executionShell.evidence.loopInputMode ?? 'pv');
    setLoopPoints(
      persisted.map((reading, index) => ({
        id: `point-${index + 1}`,
        setpointPercent: reading.setpointPercent,
        expected: reading.expected,
        measured: reading.measured,
      })),
    );
  }, [loopReadingsHydrationKey, executionShell]);
  const [activeHistoryPointId, setActiveHistoryPointId] = useState('current-result');
  const [calculatorApplyTargetId, setCalculatorApplyTargetId] = useState('expectedValue:main');
  const [activeReviewGroupKey, setActiveReviewGroupKey] =
    useState<VisualReviewQueueGroupKey>('pending-review');
  const [pendingReviewDecision, setPendingReviewDecision] =
    useState<VisualReviewDecisionRequest | null>(null);
  const [shellMessage, setShellMessage] = useState<string | null>(null);
  const demoShellEnabled = isVisualDemoShellEnabled();
  const model = useMemo(
    () =>
      buildTechnicianVisualWorkflow({
        authenticated: Boolean(session),
        demoEnabled: demoShellEnabled,
        workPackages,
        localTags: visibleTags,
        selectedTag: selectedLocalTag,
        selectedTagContext,
      }),
    [demoShellEnabled, selectedLocalTag, selectedTagContext, session, visibleTags, workPackages],
  );
  const packagePreparation = useMemo(
    () =>
      buildVisualWorkPackagePreparation({
        session,
        workPackages,
        packageBusy,
      }),
    [packageBusy, session, workPackages],
  );
  const serviceCalculation = useMemo(
    () => buildVisualExecutionCalculation(executionShell),
    [executionShell],
  );
  const serviceHistory = useMemo(() => buildVisualExecutionHistory(executionShell), [
    executionShell,
  ]);
  const selectedTemplateOption = useMemo(
    () =>
      selectedTagContext?.referencePointers.executionTemplates.find(
        (template) => template.id === selectedExecutionTemplateId,
      ) ?? null,
    [selectedExecutionTemplateId, selectedTagContext],
  );
  const selectedExecutionPattern = useMemo(
    () => resolveVisualExecutionPattern(executionShell?.template ?? selectedTemplateOption),
    [executionShell, selectedTemplateOption],
  );
  const executionStages = useMemo(
    () => buildExecutionStages(selectedExecutionPattern.pattern),
    [selectedExecutionPattern.pattern],
  );
  const historyPointOptions = useMemo(
    () => buildVisualHistoryPointOptions(serviceHistory, serviceCalculation.conversion),
    [serviceCalculation.conversion, serviceHistory],
  );
  const serviceGuidance = useMemo(() => buildVisualExecutionGuidance(executionShell), [
    executionShell,
  ]);
  const serviceReport = useMemo(
    // Story 8.9 D-01: thread the executionAiDiagnosis projection into the
    // report projection so the AI section reflects backend state (pending /
    // available / unavailable / failed-nonblocking) rather than the
    // hardcoded 'unavailable' default.
    () => buildVisualReportProjection(executionShell, reportSyncDetail, executionAiDiagnosis),
    [executionShell, reportSyncDetail, executionAiDiagnosis],
  );
  const reportActions = useMemo(
    () =>
      createVisualReportActions({
        onAttachPhoto: onAttachReportPhoto,
        onRemovePhoto: onRemoveReportPhoto,
        onRefreshServerStatus: onRefreshReportServerStatus,
        onRetrySync: onRetryReportSync,
        onSaveDraft: onSaveReportDraft,
        onSubmitReport,
      }),
    [
      onAttachReportPhoto,
      onRefreshReportServerStatus,
      onRemoveReportPhoto,
      onRetryReportSync,
      onSaveReportDraft,
      onSubmitReport,
    ],
  );
  const reviewAccess = useMemo(() => buildVisualReviewAccess(session), [session]);
  const reviewQueueGroups = useMemo(
    () => buildVisualReviewQueueGroups(supervisorReviewQueue),
    [supervisorReviewQueue],
  );
  const reviewDetail = useMemo(
    // Story 8.9 D-01: thread the supervisorAiDiagnosis projection into the
    // supervisor review detail so the assistive AI status is visible
    // alongside the technician's report.
    () => buildVisualReviewDetailProjection(
      selectedSupervisorReviewReport,
      reviewAccess,
      supervisorAiDiagnosis,
    ),
    [reviewAccess, selectedSupervisorReviewReport, supervisorAiDiagnosis],
  );
  const reviewDecisionActions = useMemo(
    () =>
      createVisualReviewDecisionActions({
        onApproveReport: onApproveSupervisorReviewReport,
        onReturnReport: onReturnSupervisorReviewReport,
        onEscalateReport: onEscalateSupervisorReviewReport,
      }),
    [
      onApproveSupervisorReviewReport,
      onEscalateSupervisorReviewReport,
      onReturnSupervisorReviewReport,
    ],
  );
  const selectedTag = session ? model.selectedTag : selectedDemoTag ?? model.selectedTag;
  const reportStatusByTag = useMemo(() => {
    const statusMap = new Map<string, VisualTagWorkStatus>();
    for (const tag of visibleTags) {
      statusMap.set(
        `${tag.workPackageId}:${tag.tagId}`,
        buildTagWorkStatus({ tag, reports: technicianReports }),
      );
    }
    return statusMap;
  }, [technicianReports, visibleTags]);
  const visibleDashboardTags = filterTags(
    [...model.pendingTags, ...model.recurrentTags, ...model.dueTags],
    activeFilter,
    searchQuery,
  );
  const calculatorApplyTargets = useMemo(
    () =>
      buildCalculatorApplyTargets(
        selectedExecutionPattern.pattern === 'loop' ? loopPoints : [],
      ),
    [loopPoints, selectedExecutionPattern.pattern],
  );

  useEffect(() => {
    if (
      session &&
      qrScanResult?.state === 'hit' &&
      shouldOpenVisualDetailForQrResult(qrScanResult, selectedLocalTag)
    ) {
      setShellMessage(qrScanResult.message);
      setRoute('detail');
    }
  }, [qrScanResult, selectedLocalTag, session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [route]);

  useEffect(() => {
    const firstOption = historyPointOptions[0]?.id ?? 'current-result';
    if (!historyPointOptions.some((option) => option.id === activeHistoryPointId)) {
      setActiveHistoryPointId(firstOption);
    }
  }, [activeHistoryPointId, historyPointOptions]);

  function openRoute(nextRoute: VisualRoute) {
    setShellMessage(null);
    if (shouldScrollRouteToTop(route, nextRoute)) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    if (route !== nextRoute) {
      // Push the route we're leaving onto the history stack so hardware-back
      // and the in-app Voltar affordance can return to it.
      routeHistoryRef.current.push(route);
    }
    setRoute(nextRoute);
  }

  // Story 8.7 AC 8/9: in-app back returns to the previously-pushed route. When
  // the history stack is empty we return `false` so Android falls through to
  // its default minimize/exit behavior.
  function popRoute(): boolean {
    if (routeHistoryRef.current.length === 0) {
      return false;
    }
    const previousRoute = routeHistoryRef.current.pop();
    if (!previousRoute) {
      return false;
    }
    setShellMessage(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setRoute(previousRoute);
    return true;
  }

  // Story 8.7 AC 1/9: tapping the TagWise logo or the Inicio affordance returns
  // the user to the dashboard while clearing the in-app history.
  function goHome() {
    routeHistoryRef.current = [];
    setShellMessage(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setRoute('dashboard');
  }

  // Story 8.7 AC 8: register the Android hardware-back listener. When the
  // QR scanner modal is open we close it first; otherwise we attempt an in-app
  // pop. Returning `false` lets the OS handle the back press (minimize) when
  // we have no history to pop.
  useEffect(() => {
    const handleHardwareBack = (): boolean => {
      if (qrScannerVisible) {
        onCancelQrScanner();
        return true;
      }
      return popRoute();
    };
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack,
    );
    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrScannerVisible, onCancelQrScanner]);

  function openCalculator(returnRoute: VisualRoute = route) {
    setCalculatorReturnRoute(returnRoute);
    openRoute('calculator');
  }

  async function handleOpenTag(tag: VisualTagSummary) {
    setShellMessage(null);

    if (!session || tag.source === 'demo') {
      setSelectedDemoTag(tag);
      setShellMessage('Modo demo visual: dados ilustrativos, nao fonte de execucao autenticada.');
      setRoute('detail');
      return;
    }

    const identity = resolveServiceBackedVisualTagIdentity(tag);
    if (!identity) {
      return;
    }

    const didOpen = await onOpenTag(identity);

    if (didOpen) {
      setRoute('detail');
    }
  }

  async function handleResolveQrManualPayload() {
    const result = await onResolveQrManualPayload();
    if (result?.state === 'hit') {
      setShellMessage(result.message);
      setRoute('detail');
    }
  }

  async function handleOpenExecutionRoute(nextRoute: VisualRoute) {
    setShellMessage(null);

    // Story 8.13 finding #2: the Compare screen consumes
    // `selectedTagContext.priorReadings` (per-tag historical data) and
    // does NOT depend on a loaded execution shell. Other execution
    // routes (calculation, loop-test, diagnosis, report) still require
    // a template selection to open the shell.
    const requiresTemplate = nextRoute !== 'history';

    if (session && requiresTemplate && !selectedExecutionTemplateId) {
      setShellMessage('Selecione um teste baixado antes de abrir a etapa tecnica.');
    } else if (session && requiresTemplate && selectedExecutionTemplateId) {
      const didLoad = await onProceedToExecutionShell();
      if (!didLoad) {
        setShellMessage('O teste local nao esta disponivel para esta tag/template.');
      }
    }

    openRoute(nextRoute);
  }

  async function handleSelectTemplateAndOpen(templateId: string) {
    setShellMessage(null);
    const template =
      selectedTagContext?.referencePointers.executionTemplates.find(
        (candidate) => candidate.id === templateId,
      ) ?? null;
    const pattern = resolveVisualExecutionPattern(template);
    const didOpen = await onOpenExecutionTemplate(templateId);

    if (didOpen) {
      setShellMessage(`${pattern.label}: ${pattern.detail}`);
      // Story 8.10 finding #9: route to the test execution via `openRoute` so
      // the current route ('detail') is pushed onto the navigation history.
      // Without this, pressing `Voltar` from the test screen incorrectly
      // popped past the detail hub. The Story 8.7 stack now correctly maps
      // dashboard -> detail -> calculation/loop-test.
      openRoute(pattern.route);
      return;
    }

    setShellMessage('Nao foi possivel abrir o teste local. Verifique se o pacote foi baixado.');
  }

  function handleOpenStageRoute(nextRoute: VisualStageRoute) {
    openRoute(nextRoute);
  }

  async function handleSaveLoopTest() {
    const result = calculateLoopTest({
      points: loopPoints,
      inputMode: loopInputMode,
      processMin: resolveLoopProcessMin(serviceCalculation),
      processMax: resolveLoopProcessMax(serviceCalculation),
      tolerance: resolveLoopTolerance(serviceCalculation),
    });
    // Story 8.15: persist per-point detail (curve + errors) into the
    // calculation evidence row so the loop screen can rehydrate after
    // navigation and the Report screen can render a formatted results
    // table. The worst-deviation row (by absolute error) is also
    // written to the calculation repo so the visit aggregator's
    // "Resumo da visita" panel renders a single-point summary that
    // matches the loop test's overall outcome.
    const persistedPoints: SharedExecutionLoopReadingPoint[] = result.rows.map((row) => ({
      setpointPercent: row.setpointPercent,
      expected: row.expected,
      measured: row.measured,
      expectedPv: row.expectedPv,
      expectedMa: row.expectedMa,
      measuredPv: row.measuredPv,
      measuredMa: row.measuredMa,
      error: row.error,
      errorPercent: row.errorPercent,
      passed: row.passed,
    }));
    const worstCase = findWorstLoopCaseRawInputs(result.rows, loopInputMode);
    await onSaveLoopTestEvidence({
      points: persistedPoints,
      inputMode: loopInputMode,
      worstCase,
    });
    setShellMessage(
      'Teste de loop salvo localmente. Volte ao instrumento para escolher outro teste ou avancar para Comparacao.',
    );
    popRoute();
  }

  function handleApplyCalculatorResult() {
    const result = calculateFieldValue(fieldCalculatorDraft);
    if (result.state !== 'available' || result.value === null) {
      setShellMessage('Calcule um valor valido antes de usar em um teste.');
      return;
    }

    const target = calculatorApplyTargets.find(
      (candidate) =>
        `${candidate.field}:${candidate.pointId ?? 'main'}` === calculatorApplyTargetId,
    );
    if (!target) {
      setShellMessage('Escolha onde usar o resultado do calculo.');
      return;
    }

    const value = String(result.value);
    if (target.pointId) {
      setLoopPoints((current) =>
        updateLoopPoint(
          current,
          target.pointId!,
          target.field === 'expectedValue' ? 'expected' : 'measured',
          value,
        ),
      );
      setShellMessage(
        `Resultado aplicado ao ponto ${target.pointLabel}. Revise e salve o teste de loop.`,
      );
      setRoute('loop-test');
      return;
    }

    onCalculationInputChange(target.field, value);
    setShellMessage(`Resultado aplicado em ${target.label.toLowerCase()}. Salve o calculo local.`);
    setRoute('calculation');
  }

  async function handleOpenReviewRoute() {
    setShellMessage(null);
    setPendingReviewDecision(null);

    if (reviewAccess.state !== 'available') {
      setShellMessage(reviewAccess.detail);
      setRoute('review');
      return;
    }

    await onRefreshSupervisorReviewQueue();
    setRoute('review');
  }

  function handleRequestReviewDecision(kind: VisualReviewDecisionKind) {
    const request = buildVisualReviewDecisionRequest({
      kind,
      detail: reviewDetail,
      returnComment: supervisorReturnComment,
      escalationRationale: supervisorEscalationRationale,
    });

    setPendingReviewDecision(request);
    if (request.state === 'blocked') {
      setShellMessage(request.message);
    } else {
      setShellMessage(null);
    }
  }

  async function handleConfirmReviewDecision() {
    const request = pendingReviewDecision;
    if (!request || request.state !== 'requires-confirmation') {
      return;
    }

    setPendingReviewDecision(null);
    await reviewDecisionActions.confirmDecision(request);
    setShellMessage(
      buildVisualReviewDecisionFeedback({
        kind: request.kind,
        reportId: request.reportId,
        tagId: selectedSupervisorReviewReport?.tagId,
      }),
    );
  }

  async function handleCreateManualInstrument() {
    setShellMessage(null);
    const didCreate = await onCreateManualInstrument(manualInstrumentDraft);

    if (didCreate) {
      setManualInstrumentDraft(createEmptyManualInstrumentDraft());
      setRoute('detail');
    }
  }

  function handleManualInstrumentDraftChange(
    key: keyof ManualInstrumentInput,
    value: string,
  ) {
    setManualInstrumentDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleFieldCalculatorChange(key: keyof FieldCalculatorInput, value: string) {
    setFieldCalculatorDraft((current) => {
      if (key === 'mode') {
        return {
          ...current,
          mode: isFieldCalculatorMode(value) ? value : current.mode,
        };
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }

  function handlePrefillCalculatorFromSelectedTag() {
    setFieldCalculatorDraft((current) => ({
      ...current,
      processMin: resolveRangePart(selectedTagContext?.range.value, 'min') ?? current.processMin,
      processMax: resolveRangePart(selectedTagContext?.range.value, 'max') ?? current.processMax,
      unit: resolveRangeUnit(selectedTagContext?.range.value) ?? current.unit,
    }));
  }

  function handleLoopPointCountChange(value: string) {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return;
    }
    setLoopPoints((current) => normalizeLoopPointCount(current, parsed));
  }

  if (!session && !demoShellEnabled) {
    return (
      <ShellErrorBoundary>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        {networkOnline === false && (
          <View style={{
            backgroundColor: '#b45309',
            paddingVertical: 6,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <Text style={{ color: '#fef3c7', fontSize: 12, fontWeight: '600' }}>
              📡 {appLanguage === 'en' ? 'Offline – changes will sync when connected' : 'Offline – as alterações sincronizarão quando conectado'}
            </Text>
          </View>
        )}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flexOne}
        >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SignedOutLoginScreen
            apiBaseUrl={apiBaseUrl}
            authBusy={authBusy}
            authMessage={authMessage}
            email={email}
            password={password}
            onEmailChange={onEmailChange}
            onPasswordChange={onPasswordChange}
            onSignIn={onSignIn}
          />
          {/* Language selector on login screen */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>
              {appLanguage === 'en' ? 'Language:' : 'Idioma:'}
            </Text>
            {(['en', 'pt-BR'] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={() => onLanguageChange?.(lang)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 4,
                  backgroundColor: appLanguage === lang ? '#2563eb' : '#1e293b',
                }}
              >
                <Text style={{ color: appLanguage === lang ? '#ffffff' : '#94a3b8', fontSize: 12 }}>
                  {lang === 'en' ? 'EN' : 'PT-BR'}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </ShellErrorBoundary>
    );
  }

  return (
    <ShellErrorBoundary>
    <ShellNavigationContext.Provider value={{ goHome, popRoute }}>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {networkOnline === false && (
        <View style={{
          backgroundColor: '#b45309',
          paddingVertical: 6,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
          <Text style={{ color: '#fef3c7', fontSize: 12, fontWeight: '600' }}>
            📡 {appLanguage === 'en' ? 'Offline – changes will sync when connected' : 'Offline – as alterações sincronizarão quando conectado'}
          </Text>
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flexOne}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {route === 'dashboard' ? (
          <DashboardScreen
            activeFilter={activeFilter}
            apiBaseUrl={apiBaseUrl}
            authBusy={authBusy}
            authMessage={authMessage}
            email={email}
            model={model}
            packageBusy={packageBusy}
            packagePreparation={packagePreparation}
            password={password}
            reviewAccess={reviewAccess}
            reviewBusy={reviewBusy}
            reviewQueueCount={supervisorReviewQueue.length}
            reportStatusByTag={reportStatusByTag}
            searchQuery={searchQuery}
            session={session}
            shellMessage={shellMessage}
            technicianReports={technicianReports}
            visibleTags={visibleDashboardTags}
            workPackages={workPackages}
            onEmailChange={onEmailChange}
            onFilterChange={setActiveFilter}
            onOpenDetail={(tag) => void handleOpenTag(tag)}
            onOpenManualInstrument={() => openRoute('manual-intake')}
            onOpenReports={() => openRoute('reports')}
            onOpenStandaloneCalculator={() => openCalculator('dashboard')}
            onPasswordChange={onPasswordChange}
            onBarcodeScanned={onBarcodeScanned}
            onCancelQrScanner={onCancelQrScanner}
            onBrowsePackageTags={(workPackageId) => void onBrowsePackageTags(workPackageId)}
            onDownloadPackage={(workPackageId) => void onDownloadPackage(workPackageId)}
            onDeleteLocalPackage={(workPackageId) => void onDeleteLocalPackage(workPackageId)}
            onRefreshPackages={onRefreshPackages}
            onSyncWithServer={onSyncWithServer}
            onOpenReview={() => void handleOpenReviewRoute()}
            onOpenSupervisorAuthoring={onOpenSupervisorAuthoring}
            onResolveQrManualPayload={() => void handleResolveQrManualPayload()}
            onQrManualPayloadChange={onQrManualPayloadChange}
            onSearchChange={setSearchQuery}
            onSignIn={onSignIn}
            onStartQrScanner={onStartQrScanner}
            onSwitchUser={onSwitchUser}
            qrManualPayload={qrManualPayload}
            qrScanResult={qrScanResult}
            qrScannerVisible={qrScannerVisible}
            appLanguage={appLanguage}
            onLanguageChange={onLanguageChange}
          />
        ) : route === 'manual-intake' ? (
          <ManualInstrumentScreen
            draft={manualInstrumentDraft}
            packageBusy={packageBusy}
            onBack={() => openRoute(calculatorReturnRoute)}
            onChange={handleManualInstrumentDraftChange}
            onCreate={() => void handleCreateManualInstrument()}
          />
        ) : route === 'calculator' ? (
          <FieldCalculatorScreen
            applyTargetId={calculatorApplyTargetId}
            applyTargets={calculatorApplyTargets}
            draft={fieldCalculatorDraft}
            canApplyToTest={Boolean(session && selectedExecutionTemplateId)}
            selectedTag={selectedTag}
            selectedTagContext={selectedTagContext}
            onBack={() => openRoute('dashboard')}
            onApplyTargetChange={setCalculatorApplyTargetId}
            onApplyToTest={handleApplyCalculatorResult}
            onChange={handleFieldCalculatorChange}
            onPrefillFromSelectedTag={handlePrefillCalculatorFromSelectedTag}
          />
        ) : route === 'reports' ? (
          <TechnicianReportsScreen
            reports={technicianReports}
            onBack={() => openRoute('dashboard')}
            onOpenReport={(report) =>
              void onOpenTechnicianReport(report).then((opened) => {
                if (opened) {
                  setRoute('report');
                }
              })
            }
          />
        ) : route === 'detail' && selectedTag ? (
          <TagDetailScreen
            // Story 8.14 finding #5: lock the test affordances on the
            // detail screen when this tag has an approved report. The
            // lock auto-clears when a fresh package is downloaded (a
            // new packageVersion brings new templates/data and the
            // approved drafts no longer pin the current view).
            approvedReportLock={Boolean(
              selectedLocalTag &&
                technicianReports.some(
                  (report) =>
                    report.workPackageId === selectedLocalTag.workPackageId &&
                    report.tagId === selectedLocalTag.tagId &&
                    report.status === 'approved',
                ),
            )}
            lastValueLabel={model.lastValueLabel}
            selectedExecutionTemplateId={selectedExecutionTemplateId}
            selectedTag={selectedTag}
            selectedTagContext={selectedTagContext}
            executionTemplateStatuses={executionTemplateStatuses}
            photoAttachments={executionShell?.evidence.photoAttachments ?? []}
            variableRangeLabel={model.variableRangeLabel}
            onAttachInstrumentPhoto={(source) =>
              void onAttachReportPhoto(source, 'Instrumento', {
                executionStepIdOverride: 'instrument',
              })
            }
            onBack={() => openRoute('dashboard')}
            onOpenCalculator={() => openCalculator('detail')}
            onOpenHistory={() => void handleOpenExecutionRoute('history')}
            onSelectExecutionTemplate={(templateId) => void handleSelectTemplateAndOpen(templateId)}
          />
        ) : route === 'detail' ? (
          <NoSelectedTagScreen onBack={() => openRoute('dashboard')} />
        ) : route === 'review' ? (
          <ServiceReviewScreen
            access={reviewAccess}
            activeGroupKey={activeReviewGroupKey}
            busy={reviewBusy}
            detail={reviewDetail}
            groups={reviewQueueGroups}
            pendingDecision={pendingReviewDecision}
            returnComment={supervisorReturnComment}
            escalationRationale={supervisorEscalationRationale}
            shellMessage={shellMessage ?? authMessage}
            onApprove={() => handleRequestReviewDecision('approve')}
            onBack={() => openRoute('dashboard')}
            onCancelDecision={() => setPendingReviewDecision(null)}
            onCloseReport={onCloseSupervisorReviewReport}
            onConfirmDecision={() => void handleConfirmReviewDecision()}
            onEscalate={() => handleRequestReviewDecision('escalate')}
            onEscalationRationaleChange={onSupervisorEscalationRationaleChange}
            onGroupChange={setActiveReviewGroupKey}
            onOpenReport={(reportId) => void onOpenSupervisorReviewReport(reportId)}
            onRefresh={() => void onRefreshSupervisorReviewQueue()}
            onReturn={() => handleRequestReviewDecision('return')}
            onReturnCommentChange={onSupervisorReturnCommentChange}
          />
        ) : !selectedTag ? (
          <NoSelectedTagScreen onBack={() => openRoute('dashboard')} />
        ) : route === 'calculation' ? (
          session ? (
            <ServiceCalculationScreen
              calculation={serviceCalculation}
              stages={executionStages}
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              photoAttachments={executionShell?.evidence.photoAttachments ?? []}
              onAttachExecutionPhoto={(source, contextNote) =>
                // Story 8.13 finding #8: tag photos with the screen's
                // executionStepId so the per-screen thumbnail filter
                // can find them. Without the override, the photo gets
                // tagged based on the shell's currentStepId which may
                // not match the screen the technician is on.
                void onAttachReportPhoto(source, contextNote, {
                  executionStepIdOverride: 'calculation',
                })
              }
              onBack={() => openRoute('detail')}
              onOpenCalculator={() => openCalculator('calculation')}
              onOpenStage={handleOpenStageRoute}
              onInputChange={onCalculationInputChange}
              onSaveCalculation={async () => {
                // Story 10.4b (issue #2): after saving, stay on the test
                // screen so the technician can see the calculated result
                // card (acceptance, signed deviation, percent of span)
                // BEFORE deciding to navigate back. Previous behavior
                // auto-popped the route which hid the result. The user
                // pops the route themselves via the Voltar / back button
                // when ready.
                await onSaveCalculation();
                setShellMessage('Calculo salvo localmente. Confira o resultado abaixo antes de voltar.');
              }}
            />
          ) : (
            <DemoCalculationScreen
              calculation={model.calculation}
              selectedTag={selectedTag}
              onBack={() => openRoute('detail')}
            />
          )
        ) : route === 'loop-test' ? (
          session ? (
            <LoopExecutionScreen
              calculation={serviceCalculation}
              inputMode={loopInputMode}
              points={loopPoints}
              photoAttachments={executionShell?.evidence.photoAttachments ?? []}
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              stages={executionStages}
              onAttachExecutionPhoto={(source, contextNote) =>
                // Story 8.13 finding #8: loop-test photos always
                // belong to the calculation step.
                void onAttachReportPhoto(source, contextNote, {
                  executionStepIdOverride: 'calculation',
                })
              }
              onBack={() => openRoute('detail')}
              onInputModeChange={setLoopInputMode}
              onOpenCalculator={() => openCalculator('loop-test')}
              onOpenStage={handleOpenStageRoute}
              onPointChange={(pointId, key, value) =>
                setLoopPoints((current) => updateLoopPoint(current, pointId, key, value))
              }
              onPointCountChange={handleLoopPointCountChange}
              onSaveLoop={() => void handleSaveLoopTest()}
            />
          ) : (
            <DemoCalculationScreen
              calculation={model.calculation}
              selectedTag={selectedTag}
              onBack={() => openRoute('detail')}
            />
          )
        ) : route === 'history' ? (
          session ? (
            <ServiceHistoryScreen
              activePointId={activeHistoryPointId}
              history={serviceHistory}
              pointOptions={historyPointOptions}
              priorReadings={selectedTagContext?.priorReadings ?? []}
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              stages={executionStages}
              onBack={() => openRoute('detail')}
              onOpenStage={handleOpenStageRoute}
              onPointChange={setActiveHistoryPointId}
              onOpenDiagnosis={() => openRoute('diagnosis')}
            />
          ) : (
            <DemoHistoryScreen
              history={model.history}
              selectedTag={selectedTag}
              onBack={() => openRoute('detail')}
              onOpenDiagnosis={() => openRoute('diagnosis')}
            />
          )
        ) : route === 'diagnosis' ? (
          session ? (
            <ServiceGuidanceScreen
              guidance={serviceGuidance}
              stages={executionStages}
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              photoAttachments={executionShell?.evidence.photoAttachments ?? []}
              onAttachExecutionPhoto={(source, contextNote) =>
                // Story 8.13 finding #8: photos taken from the checklist
                // screen must be stamped with executionStepId='guidance'
                // so the screen's own thumbnail row finds them.
                void onAttachReportPhoto(source, contextNote, {
                  executionStepIdOverride: 'guidance',
                })
              }
              onBack={() => openRoute('detail')}
              onChecklistOutcomeChange={onChecklistOutcomeChange}
              onObservationNotesChange={onObservationNotesChange}
              onOpenStage={handleOpenStageRoute}
              onOpenReport={() => openRoute('report')}
              onRiskJustificationChange={onRiskJustificationChange}
              onSaveGuidanceEvidence={async () => {
                await onSaveGuidanceEvidence();
                setShellMessage('Checklist salvo localmente. Proximo: adicionar evidencia ou gerar relatorio.');
              }}
            />
          ) : (
            <DemoDiagnosisScreen
              diagnosis={{
                ...model.diagnosis,
                selectedSymptom,
              }}
              onBack={() => openRoute('detail')}
              onOpenReport={() => openRoute('report')}
              onSelectSymptom={setSelectedSymptom}
            />
          )
        ) : route === 'report' ? (
          session ? (
            <ServiceReportScreen
              report={serviceReport}
              stages={executionStages}
              shellMessage={shellMessage ?? authMessage}
              syncBusy={syncBusy}
              instrumentVisit={instrumentVisit}
              onAttachCamera={() => void reportActions.attachPhotoFromCamera()}
              onAttachLibrary={() => void reportActions.attachPhotoFromLibrary()}
              onBack={() => openRoute('diagnosis')}
              onRefreshServerStatus={() => void reportActions.refreshServerStatus()}
              onRemovePhoto={(evidenceId) => void reportActions.removePhoto(evidenceId)}
              onRetrySync={() => void reportActions.retrySync()}
              onNavigatePending={(pendingRoute) => openRoute(pendingRoute)}
              onOpenStage={handleOpenStageRoute}
              onReviewNotesChange={onReportReviewNotesChange}
              onSaveDraft={async () => {
                await reportActions.saveDraft();
                setShellMessage('Rascunho salvo localmente. Proximo: enviar para fila local ou adicionar evidencias.');
              }}
              onSubmitReport={async () => {
                await reportActions.submitReport();
                setShellMessage('Envio solicitado. O status local/sync permanece visivel neste relatorio.');
              }}
              onUpdatePhotoTechnicianNote={(evidenceId, note) =>
                void onUpdatePhotoTechnicianNote(evidenceId, note)
              }
              onRequestExecutionAiDiagnosis={() => void onRequestExecutionAiDiagnosis()}
              onStartNewVisit={onStartNewVisit}
              appLanguage={appLanguage}
            />
          ) : (
            <DemoReportScreen
              justification={justification}
              report={model.report}
              onBack={() => openRoute('diagnosis')}
              onJustificationChange={setJustification}
              onOpenApproval={() => openRoute('approval')}
            />
          )
        ) : route === 'approval' && !session ? (
          <ApprovalScreen
            justification={justification}
            report={model.report}
            onApprove={() => {
              setShellMessage('Aprovacao demo registrada localmente para o smoke test.');
              setRoute('dashboard');
            }}
            onBack={() => openRoute('report')}
            onReturn={() => {
              setShellMessage('Devolucao demo registrada localmente para o smoke test.');
              setRoute('dashboard');
            }}
          />
        ) : (
          <NoSelectedTagScreen onBack={() => openRoute('dashboard')} />
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      {/* Story 8.12 finding #6: floating toast that overlays the bottom
          of the screen regardless of scroll position. Previously
          confirmation and error messages rendered inline at the top of
          each screen and scrolled out of view while the user was filling
          a form lower on the page. The toast auto-clears after 5s and
          can be dismissed manually. */}
      <MessageToast message={shellMessage} onDismiss={() => setShellMessage(null)} />
    </SafeAreaView>
    </ShellNavigationContext.Provider>
    </ShellErrorBoundary>
  );
}

function MessageToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) {
    return null;
  }
  return (
    <View pointerEvents="box-none" style={styles.toastOverlay}>
      <View style={styles.toastCard}>
        <Text style={styles.toastMessage}>{message}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.toastDismiss}
        >
          <Text style={styles.toastDismissLabel}>x</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DashboardScreen({
  activeFilter,
  apiBaseUrl,
  authBusy,
  authMessage,
  email,
  model,
  packageBusy,
  packagePreparation,
  password,
  reviewAccess,
  reviewBusy,
  reviewQueueCount,
  reportStatusByTag,
  searchQuery,
  session,
  shellMessage,
  technicianReports,
  visibleTags,
  onEmailChange,
  onFilterChange,
  onOpenDetail,
  onOpenManualInstrument,
  onPasswordChange,
  onBarcodeScanned,
  onCancelQrScanner,
  onBrowsePackageTags,
  onDownloadPackage,
  onDeleteLocalPackage,
  onQrManualPayloadChange,
  onOpenReports,
  onOpenReview,
  onOpenSupervisorAuthoring,
  onOpenStandaloneCalculator,
  onSyncWithServer,
  onResolveQrManualPayload,
  onRefreshPackages,
  onSearchChange,
  onSignIn,
  onStartQrScanner,
  onSwitchUser,
  qrManualPayload,
  qrScanResult,
  qrScannerVisible,
  appLanguage,
  onLanguageChange,
}: {
  activeFilter: VisualTagCategory | 'all';
  apiBaseUrl: string;
  authBusy: boolean;
  authMessage: string | null;
  email: string;
  model: ReturnType<typeof buildTechnicianVisualWorkflow>;
  packageBusy: boolean;
  packagePreparation: VisualWorkPackagePreparationProjection;
  password: string;
  reviewAccess: ReturnType<typeof buildVisualReviewAccess>;
  reviewBusy: boolean;
  reviewQueueCount: number;
  reportStatusByTag: Map<string, VisualTagWorkStatus>;
  searchQuery: string;
  session: ActiveUserSession | null;
  shellMessage: string | null;
  technicianReports: VisualTechnicianReportSummary[];
  visibleTags: VisualTagSummary[];
  workPackages: LocalAssignedWorkPackageSummary[];
  onEmailChange: (value: string) => void;
  onFilterChange: (value: VisualTagCategory | 'all') => void;
  onOpenDetail: (tag: VisualTagSummary) => void;
  onOpenManualInstrument: () => void;
  onPasswordChange: (value: string) => void;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
  onCancelQrScanner: () => void;
  onBrowsePackageTags: (workPackageId: string) => void;
  onDownloadPackage: (workPackageId: string) => void;
  onDeleteLocalPackage: (workPackageId: string) => void;
  onQrManualPayloadChange: (value: string) => void;
  onOpenReports: () => void;
  onOpenReview: () => void;
  onOpenSupervisorAuthoring?: () => void;
  onOpenStandaloneCalculator: () => void;
  onSyncWithServer?: () => void;
  onResolveQrManualPayload: () => void;
  onRefreshPackages: () => void;
  onSearchChange: (value: string) => void;
  onSignIn: () => void;
  onStartQrScanner: () => void;
  onSwitchUser: () => void;
  qrManualPayload: string;
  qrScanResult: LocalQrScanResult | null;
  qrScannerVisible: boolean;
  appLanguage?: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
}) {
  const navigation = useShellNavigation();
  return (
    <>
      <View style={styles.dashboardHeader}>
        <View>
          <TagWiseLogo large onPress={navigation?.goHome} />
          <Text style={styles.headerSubtitle}>Campo, calculo e relatorio por tag</Text>
        </View>
        {/* Language selector in dashboard header */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            {appLanguage === 'en' ? 'Language:' : 'Idioma:'}
          </Text>
          {(['en', 'pt-BR'] as const).map((lang) => (
            <Pressable
              key={lang}
              onPress={() => onLanguageChange?.(lang)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 4,
                backgroundColor: appLanguage === lang ? '#2563eb' : '#1e293b',
              }}
            >
              <Text style={{ color: appLanguage === lang ? '#ffffff' : '#94a3b8', fontSize: 12 }}>
                {lang === 'en' ? 'EN' : 'PT-BR'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {session ? (
        <DashboardActionPanel
          reports={technicianReports}
          packageBusy={packageBusy}
          reviewBusy={reviewBusy}
          onOpenManualInstrument={onOpenManualInstrument}
          onOpenReports={onOpenReports}
          onOpenStandaloneCalculator={onOpenStandaloneCalculator}
          onSyncWithServer={onSyncWithServer}
        />
      ) : null}

      <View style={styles.searchGrid}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>?</Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={onSearchChange}
            placeholder="Buscar tag, ativo ou area..."
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            value={searchQuery}
          />
        </View>
        <Pressable accessibilityRole="button" onPress={onStartQrScanner} style={styles.qrButton}>
          <Text style={styles.qrIcon}>QR</Text>
          <Text style={styles.qrButtonLabel}>Escanear QR</Text>
        </Pressable>
      </View>

      <QrResolutionPanel
        manualPayload={qrManualPayload}
        qrScanResult={qrScanResult}
        scannerVisible={qrScannerVisible}
        onBarcodeScanned={onBarcodeScanned}
        onCancel={onCancelQrScanner}
        onManualPayloadChange={onQrManualPayloadChange}
        onResolveManualPayload={onResolveQrManualPayload}
      />

      <ScrollView
        contentContainerStyle={styles.chipRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <FilterChip
          active={activeFilter === 'all'}
          count={model.counts.all}
          label="Todos"
          onPress={() => onFilterChange('all')}
        />
        <FilterChip
          active={activeFilter === 'pending'}
          count={model.counts.pending}
          label="Pendente"
          onPress={() => onFilterChange('pending')}
        />
        <FilterChip
          active={activeFilter === 'recurrent'}
          count={model.counts.recurrent}
          label="Reincidente"
          onPress={() => onFilterChange('recurrent')}
        />
        <FilterChip
          active={activeFilter === 'due'}
          count={model.counts.due}
          label="Vencendo"
          onPress={() => onFilterChange('due')}
        />
      </ScrollView>

      {shellMessage ? <InlineMessage text={shellMessage} /> : null}

      <SectionHeader title="Abertas recentemente" />
      <ScrollView
        contentContainerStyle={styles.recentRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {model.recentTags.map((tag) => (
          <RecentTagCard key={`${tag.workPackageId}:${tag.id}`} tag={tag} onPress={onOpenDetail} />
        ))}
      </ScrollView>

      <ConnectionCard
        apiBaseUrl={apiBaseUrl}
        authBusy={authBusy}
        authMessage={authMessage}
        email={email}
        packageBusy={packageBusy}
        packageSummary={model.packageSummary}
        password={password}
        session={session}
        source={model.source}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onRefreshPackages={onRefreshPackages}
        onSignIn={onSignIn}
        onSwitchUser={onSwitchUser}
      />

      {session ? (
        <>
          <WorkPackagePreparationPanel
            packageBusy={packageBusy}
            preparation={packagePreparation}
            onBrowsePackageTags={onBrowsePackageTags}
            onDownloadPackage={onDownloadPackage}
            onDeleteLocalPackage={onDeleteLocalPackage}
            onRefreshPackages={onRefreshPackages}
          />
          <ManualInstrumentPanel
            onOpen={onOpenManualInstrument}
          />
        </>
      ) : null}

      {reviewAccess.state === 'available' || reviewAccess.state === 'connected-required' ? (
        <ReviewAccessCard
          access={reviewAccess}
          busy={reviewBusy}
          queueCount={reviewQueueCount}
          onOpenReview={onOpenReview}
        />
      ) : null}
      {/* Story 9.4: supervisor / manager tile to open the create-package flow. */}
      {reviewAccess.state === 'available' && onOpenSupervisorAuthoring ? (
        <SupervisorAuthoringAccessCard onOpen={onOpenSupervisorAuthoring} />
      ) : null}

      <TagSection
        accentColor="#ff8b49"
        reportStatusByTag={reportStatusByTag}
        tags={visibleTags.filter((tag) => tag.category === 'pending')}
        title="Pendentes"
        totalLabel={`(${model.counts.pending})`}
        onOpenDetail={onOpenDetail}
      />
      <TagSection
        accentColor={colors.red}
        reportStatusByTag={reportStatusByTag}
        tags={visibleTags.filter((tag) => tag.category === 'recurrent')}
        title="Reincidentes"
        totalLabel={`(${model.counts.recurrent})`}
        onOpenDetail={onOpenDetail}
      />
      <TagSection
        accentColor={colors.amber}
        reportStatusByTag={reportStatusByTag}
        tags={visibleTags.filter((tag) => tag.category === 'due')}
        title="Vencendo"
        totalLabel={`(${model.counts.due})`}
        onOpenDetail={onOpenDetail}
      />
    </>
  );
}

function SignedOutLoginScreen({
  apiBaseUrl,
  authBusy,
  authMessage,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSignIn,
}: {
  apiBaseUrl: string;
  authBusy: boolean;
  authMessage: string | null;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
}) {
  return (
    <>
      <View style={styles.dashboardHeader}>
        <View>
          <TagWiseLogo large />
          <Text style={styles.headerSubtitle}>Entre para acessar a execucao de campo</Text>
        </View>
      </View>

      <View style={styles.connectionCard}>
        <View style={styles.connectionHeader}>
          <View>
            <Text style={styles.connectionTitle}>TagWise login</Text>
            <Text style={styles.connectionBody}>
              O login conectado carrega pacotes atribuidos de {apiBaseUrl}. A restauracao offline
              fica disponivel depois do primeiro login bem-sucedido.
            </Text>
          </View>
          <StatusPill label="Login" severity="medium" />
        </View>

        {authMessage ? <Text style={styles.connectionMessage}>{authMessage}</Text> : null}

        <View style={styles.loginGrid}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={onEmailChange}
            placeholder="Email"
            placeholderTextColor={colors.textSubtle}
            style={styles.darkInput}
            value={email}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onPasswordChange}
            placeholder="Senha"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={styles.darkInput}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={authBusy}
            onPress={onSignIn}
            style={[styles.smallActionButton, authBusy ? styles.disabledAction : null]}
          >
            <Text style={styles.smallActionLabel}>{authBusy ? 'Entrando...' : 'Entrar'}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function WorkPackagePreparationPanel({
  packageBusy,
  preparation,
  onBrowsePackageTags,
  onDownloadPackage,
  onDeleteLocalPackage,
  onRefreshPackages,
}: {
  packageBusy: boolean;
  preparation: VisualWorkPackagePreparationProjection;
  onBrowsePackageTags: (workPackageId: string) => void;
  onDownloadPackage: (workPackageId: string) => void;
  onDeleteLocalPackage: (workPackageId: string) => void;
  onRefreshPackages: () => void;
}) {
  return (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View>
          <Text style={styles.connectionTitle}>{preparation.title}</Text>
          <Text style={styles.connectionBody}>{preparation.detail}</Text>
        </View>
        <StatusPill
          label={preparation.state === 'available' ? `${preparation.packages.length}` : 'Pacotes'}
          severity={preparation.state === 'available' ? 'ok' : 'medium'}
        />
      </View>

      <View style={styles.connectionActionRow}>
        <Pressable
          accessibilityRole="button"
          disabled={!preparation.canRefresh}
          onPress={onRefreshPackages}
          style={[styles.smallActionButton, !preparation.canRefresh ? styles.disabledAction : null]}
        >
          <Text style={styles.smallActionLabel}>
            {packageBusy ? 'Atualizando...' : 'Atualizar lista'}
          </Text>
        </Pressable>
      </View>

      {preparation.packages.length === 0 ? (
        <InlineMessage text={preparation.detail} />
      ) : (
        <View style={styles.packageList}>
          {preparation.packages.map((workPackage) => (
            <View key={workPackage.id} style={styles.packageCard}>
              <View style={styles.connectionHeader}>
                <View style={styles.flexOne}>
                  <Text style={styles.templateTitle}>{workPackage.title}</Text>
                  <Text style={styles.templateBody}>
                    {workPackage.sourceReference} - {workPackage.tagCountLabel}
                  </Text>
                </View>
                <StatusPill
                  label={workPackage.cacheLabel}
                  severity={workPackage.cacheState === 'cached' ? 'ok' : 'medium'}
                />
              </View>
              <Text style={styles.connectionBody}>{workPackage.detail}</Text>
              {workPackage.reconciliationLabel ? (
                <Text style={styles.connectionMessage}>{workPackage.reconciliationLabel}</Text>
              ) : null}
              <View style={styles.connectionActionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!workPackage.canDownload}
                  onPress={() => onDownloadPackage(workPackage.id)}
                  style={[
                    styles.smallActionButton,
                    !workPackage.canDownload ? styles.disabledAction : null,
                  ]}
                >
                  <Text style={styles.smallActionLabel}>
                    {workPackage.cacheState === 'cached' ? 'Atualizar snapshot' : 'Baixar snapshot'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!workPackage.canBrowse}
                  onPress={() => onBrowsePackageTags(workPackage.id)}
                  style={[
                    styles.smallGhostButton,
                    !workPackage.canBrowse ? styles.disabledAction : null,
                  ]}
                >
                  <Text style={styles.smallGhostLabel}>Abrir tags</Text>
                </Pressable>
                {/* Story 8.13: Apagar pacote local. Story 8.14 #5
                    adds a confirmation dialog so the action cannot be
                    triggered by accident. Approved reports stay
                    visible in history (drafts preserved); the tag with
                    an approved report stays locked on the detail
                    screen until a new package version arrives. */}
                {workPackage.cacheState === 'cached' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={packageBusy}
                    onPress={() =>
                      Alert.alert(
                        'Apagar pacote local',
                        `Apagar os dados locais de "${workPackage.title}"? ` +
                          'O snapshot e o progresso de testes em andamento serao removidos. ' +
                          'Relatorios ja aprovados continuam visiveis no historico e os ' +
                          'instrumentos correspondentes permanecem bloqueados ate o proximo pacote.',
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Apagar',
                            style: 'destructive',
                            onPress: () => onDeleteLocalPackage(workPackage.id),
                          },
                        ],
                      )
                    }
                    style={[
                      styles.smallGhostButton,
                      packageBusy ? styles.disabledAction : null,
                    ]}
                  >
                    <Text style={styles.smallGhostLabel}>Apagar pacote local</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ManualInstrumentPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View style={styles.flexOne}>
          <Text style={styles.connectionTitle}>Instrumento fora do pacote?</Text>
          <Text style={styles.connectionBody}>
            Cadastre um instrumento manual local. Ele fica marcado como pendente de reconciliacao
            e nao vira ativo oficial automaticamente.
          </Text>
        </View>
        <StatusPill label="Manual" severity="due" />
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.smallActionButton}>
        <Text style={styles.smallActionLabel}>Cadastrar instrumento manual</Text>
      </Pressable>
    </View>
  );
}

function ManualInstrumentScreen({
  draft,
  packageBusy,
  onBack,
  onChange,
  onCreate,
}: {
  draft: ManualInstrumentInput;
  packageBusy: boolean;
  onBack: () => void;
  onChange: (key: keyof ManualInstrumentInput, value: string) => void;
  onCreate: () => void;
}) {
  const requiredReady =
    draft.description.trim().length > 0 &&
    draft.area.trim().length > 0 &&
    draft.instrumentFamily.trim().length > 0 &&
    draft.reason.trim().length > 0;

  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.screenTitle}>Cadastrar instrumento</Text>
      <InlineMessage text="Cadastro local para campo. Use quando a tag nao existe no pacote baixado. A reconciliacao com SAP/Maximo/TOTVS fica pendente." />

      <View style={styles.connectionCard}>
        <Text style={styles.sectionTitle}>Dados basicos</Text>
        <View style={styles.loginGrid}>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(value) => onChange('tagCode', value)}
            placeholder="Tag/codigo opcional"
            placeholderTextColor={colors.textSubtle}
            style={styles.darkInput}
            value={draft.tagCode}
          />
          <TextInput
            autoCorrect={false}
            onChangeText={(value) => onChange('description', value)}
            placeholder="Descricao do instrumento"
            placeholderTextColor={colors.textSubtle}
            style={styles.darkInput}
            value={draft.description}
          />
          <TextInput
            autoCorrect={false}
            onChangeText={(value) => onChange('area', value)}
            placeholder="Area/localizacao"
            placeholderTextColor={colors.textSubtle}
            style={styles.darkInput}
            value={draft.area}
          />
        </View>
      </View>

      <View style={styles.connectionCard}>
        <Text style={styles.sectionTitle}>Tipo e sinal</Text>
        <PickerChips
          label="Familia"
          options={['Transmissor de pressao', 'Transmissor de temperatura', 'Transmissor de nivel', 'Transmissor de vazao', 'Valvula de controle']}
          value={draft.instrumentFamily ?? ''}
          onChange={(value) => onChange('instrumentFamily', value)}
        />
        <PickerChips
          label="Variavel"
          options={['Pressao', 'Temperatura', 'Nivel', 'Vazao', 'Corrente']}
          value={draft.measuredVariable ?? ''}
          onChange={(value) => onChange('measuredVariable', value)}
        />
        <PickerChips
          label="Sinal"
          options={['4-20 mA', 'HART', 'Digital', 'Pneumatico', 'Outro']}
          value={draft.signalType ?? ''}
          onChange={(value) => onChange('signalType', value)}
        />
        <TextInput
          autoCorrect={false}
          onChangeText={(value) => onChange('instrumentSubtype', value)}
          placeholder="Subtipo ou modelo opcional"
          placeholderTextColor={colors.textSubtle}
          style={styles.darkInput}
          value={draft.instrumentSubtype}
        />
      </View>

      <View style={styles.connectionCard}>
        <Text style={styles.sectionTitle}>Faixa e tolerancia</Text>
        <PickerChips
          label="Unidade"
          options={['bar', 'mbar', 'psi', 'degC', 'm', '%', 'm3/h']}
          value={draft.unit ?? ''}
          onChange={(value) => onChange('unit', value)}
        />
        <View style={styles.twoColumnRow}>
          <TextInput
            autoCorrect={false}
            keyboardType="numeric"
            onChangeText={(value) => onChange('rangeMin', value)}
            placeholder="Range min"
            placeholderTextColor={colors.textSubtle}
            style={[styles.darkInput, styles.flexOne]}
            value={draft.rangeMin}
          />
          <TextInput
            autoCorrect={false}
            keyboardType="numeric"
            onChangeText={(value) => onChange('rangeMax', value)}
            placeholder="Range max"
            placeholderTextColor={colors.textSubtle}
            style={[styles.darkInput, styles.flexOne]}
            value={draft.rangeMax}
          />
        </View>
        <PickerChips
          label="Tolerancia comum"
          options={['+/-0.1%', '+/-0.2%', '+/-0.5%', '+/-1%', '+/-0.25 unidade']}
          value={draft.tolerance ?? ''}
          onChange={(value) => onChange('tolerance', value)}
        />
      </View>

      <View style={styles.connectionCard}>
        <Text style={styles.sectionTitle}>Motivo</Text>
        <TextInput
          autoCorrect={false}
          multiline
          onChangeText={(value) => onChange('reason', value)}
          placeholder="Por que o cadastro manual e necessario?"
          placeholderTextColor={colors.textSubtle}
          style={styles.justificationInput}
          value={draft.reason}
        />
        <TextInput
          autoCorrect={false}
          multiline
          onChangeText={(value) => onChange('notes', value)}
          placeholder="Notas opcionais"
          placeholderTextColor={colors.textSubtle}
          style={styles.justificationInput}
          value={draft.notes}
        />
      </View>

      <View style={styles.stickyActionBar}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.smallGhostButton}>
          <Text style={styles.smallGhostLabel}>Voltar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!requiredReady || packageBusy}
          onPress={onCreate}
          style={[
            styles.smallActionButton,
            !requiredReady || packageBusy ? styles.disabledAction : null,
          ]}
        >
          <Text style={styles.smallActionLabel}>
            {packageBusy ? 'Salvando...' : 'Criar cadastro local'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function DashboardActionPanel({
  reports,
  packageBusy,
  reviewBusy,
  onOpenManualInstrument,
  onOpenReports,
  onOpenStandaloneCalculator,
  onSyncWithServer,
}: {
  reports: VisualTechnicianReportSummary[];
  packageBusy: boolean;
  reviewBusy: boolean;
  onOpenManualInstrument: () => void;
  onOpenReports: () => void;
  onOpenStandaloneCalculator: () => void;
  onSyncWithServer?: () => void;
}) {
  const pendingSync = reports.filter((report) => report.status === 'pending-sync').length;
  const returned = reports.filter((report) => report.status === 'returned').length;
  // Story 10.7 (issue follow-up): the sync button is the single affordance
  // that refreshes everything the user might be waiting on from the
  // server (packages + in-flight report decisions + review queue for
  // supervisors). Disabled while any of the underlying refreshes is busy
  // so taps are not stacked.
  const syncBusy = packageBusy || reviewBusy;

  return (
    <View style={styles.quickActionPanel}>
      <Text style={styles.sectionTitle}>O que fazer agora?</Text>
      {onSyncWithServer ? (
        <Pressable
          accessibilityRole="button"
          disabled={syncBusy}
          onPress={onSyncWithServer}
          style={[
            styles.fullWidthPrimary,
            syncBusy ? styles.disabledAction : null,
          ]}
        >
          <Text style={styles.fullWidthPrimaryLabel}>
            {syncBusy ? 'Sincronizando...' : 'Sincronizar com servidor'}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.quickActionGrid}>
        <Pressable accessibilityRole="button" onPress={onOpenStandaloneCalculator} style={styles.quickActionButton}>
          <Text style={styles.quickActionTitle}>Calculadora</Text>
          <Text style={styles.quickActionBody}>4-20 mA, PV e erro.</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenReports} style={styles.quickActionButton}>
          <Text style={styles.quickActionTitle}>Meus relatorios</Text>
          <Text style={styles.quickActionBody}>
            {reports.length} local(is), {pendingSync} pendente(s) sync.
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenManualInstrument} style={styles.quickActionButton}>
          <Text style={styles.quickActionTitle}>Novo instrumento</Text>
          <Text style={styles.quickActionBody}>Cadastro manual local.</Text>
        </Pressable>
        {/* Story 10.7: the "Correcoes" tile is now tappable and routes to
            the technician reports list so the user can find the returned
            reports right away instead of guessing where they live. */}
        <Pressable
          accessibilityRole="button"
          onPress={onOpenReports}
          style={styles.quickActionButton}
        >
          <Text style={styles.quickActionTitle}>Correcoes</Text>
          <Text style={styles.quickActionBody}>
            {returned > 0
              ? `${returned} devolvido(s) para retrabalho.`
              : 'Nenhum relatorio devolvido.'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function FieldCalculatorScreen({
  applyTargetId,
  applyTargets,
  canApplyToTest,
  draft,
  selectedTag,
  selectedTagContext,
  onBack,
  onApplyTargetChange,
  onApplyToTest,
  onChange,
  onPrefillFromSelectedTag,
}: {
  applyTargetId: string;
  applyTargets: ReturnType<typeof buildCalculatorApplyTargets>;
  canApplyToTest: boolean;
  draft: FieldCalculatorInput;
  selectedTag: VisualTagSummary | null;
  selectedTagContext: LocalTagContext | null;
  onBack: () => void;
  onApplyTargetChange: (value: string) => void;
  onApplyToTest: () => void;
  onChange: (key: keyof FieldCalculatorInput, value: string) => void;
  onPrefillFromSelectedTag: () => void;
}) {
  // Story 8.7 AC 3:
  //   (a) explicit Calcular button + visible Resultado panel (no auto-update).
  //   (b) Conversao / Loop mode toggle. Loop mode restores the 5/10-point
  //       helper that Story 8.6 moved out of the calculator. It is a helper
  //       only — does not persist to any instrument execution.
  const [helperMode, setHelperMode] = useState<'conversion' | 'loop' | 'sweep'>('conversion');
  const [showResult, setShowResult] = useState(false);
  const [needsRecalculate, setNeedsRecalculate] = useState(false);
  const [loopHelperPoints, setLoopHelperPoints] = useState<LoopTestPoint[]>(() =>
    createDefaultLoopPoints(5),
  );
  const [loopHelperInputMode, setLoopHelperInputMode] = useState<LoopPointInputMode>('pv');
  const [loopShowResult, setLoopShowResult] = useState(false);

  const result = calculateFieldValue(draft);

  // Reset visibility when the user changes inputs after a result is shown so
  // the panel does not silently lie about a stale value.
  function handleInputChange(key: keyof FieldCalculatorInput, value: string) {
    onChange(key, value);
    if (showResult) {
      setNeedsRecalculate(true);
    }
  }
  function handleCalculate() {
    setShowResult(true);
    setNeedsRecalculate(false);
  }

  function handleLoopPointChange(pointId: string, key: 'expected' | 'measured', value: string) {
    setLoopHelperPoints((current) => updateLoopPoint(current, pointId, key, value));
    if (loopShowResult) {
      setLoopShowResult(false);
    }
  }
  function handleLoopPointCountChange(rawValue: string) {
    const parsed = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return;
    }
    setLoopHelperPoints((current) => normalizeLoopPointCount(current, parsed));
    if (loopShowResult) {
      setLoopShowResult(false);
    }
  }

  const loopResult =
    helperMode === 'loop'
      ? calculateLoopTest({
          points: loopHelperPoints,
          inputMode: loopHelperInputMode,
          processMin: draft.processMin,
          processMax: draft.processMax,
          tolerance: draft.tolerance,
        })
      : null;

  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.screenTitle}>Calculadora de campo</Text>
      <InlineMessage text="Use como ferramenta independente ou preencha pela tag selecionada. Nada aqui envia dados ao servidor sozinho." />

      {selectedTag && selectedTagContext ? (
        <Pressable accessibilityRole="button" onPress={onPrefillFromSelectedTag} style={styles.smallGhostButton}>
          <Text style={styles.smallGhostLabel}>Usar faixa de {selectedTag.code}</Text>
        </Pressable>
      ) : null}

      {/* Story 10.5 (issue #6): renamed chip labels so the loop-test helper
          is discoverable as "Teste de loop" instead of the cryptic
          "Modo: Loop". The "Modo:" prefix is dropped because the row itself
          IS the mode selector and the prefix was wasting horizontal space. */}
      <View style={styles.pickerChipRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setHelperMode('conversion')}
          style={[
            styles.pickerChip,
            helperMode === 'conversion' ? styles.pickerChipActive : null,
          ]}
        >
          <Text
            style={[
              styles.pickerChipText,
              helperMode === 'conversion' ? styles.pickerChipTextActive : null,
            ]}
          >
            Conversao
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setHelperMode('loop')}
          style={[
            styles.pickerChip,
            helperMode === 'loop' ? styles.pickerChipActive : null,
          ]}
        >
          <Text
            style={[
              styles.pickerChipText,
              helperMode === 'loop' ? styles.pickerChipTextActive : null,
            ]}
          >
            Teste de loop
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setHelperMode('sweep')}
          style={[
            styles.pickerChip,
            helperMode === 'sweep' ? styles.pickerChipActive : null,
          ]}
        >
          <Text
            style={[
              styles.pickerChipText,
              helperMode === 'sweep' ? styles.pickerChipTextActive : null,
            ]}
          >
            Tabela 0-100%
          </Text>
        </Pressable>
      </View>

      {helperMode === 'sweep' ? (
        <CalculatorSweepPanel
          processMinRaw={draft.processMin}
          processMaxRaw={draft.processMax}
          unit={draft.unit}
        />
      ) : helperMode === 'conversion' ? (
        <>
          <View style={styles.connectionCard}>
            <Text style={styles.sectionTitle}>Conversor rapido</Text>
            <PickerChips
              label="Modo"
              options={['pv-to-ma', 'ma-to-pv', 'pv-to-percent', 'ma-to-percent', 'percent-to-ma', 'error']}
              value={draft.mode}
              onChange={(value) => handleInputChange('mode', value)}
            />
            <View style={styles.twoColumnRow}>
              <TextInput
                autoCorrect={false}
                keyboardType="numeric"
                onChangeText={(value) => handleInputChange('processMin', value)}
                placeholder="PV min"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, styles.flexOne]}
                value={draft.processMin}
              />
              <TextInput
                autoCorrect={false}
                keyboardType="numeric"
                onChangeText={(value) => handleInputChange('processMax', value)}
                placeholder="PV max"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, styles.flexOne]}
                value={draft.processMax}
              />
            </View>
            <View style={styles.twoColumnRow}>
              <TextInput
                autoCorrect={false}
                onChangeText={(value) => handleInputChange('unit', value)}
                placeholder="Unidade"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, styles.flexOne]}
                value={draft.unit}
              />
              <TextInput
                autoCorrect={false}
                keyboardType="numeric"
                onChangeText={(value) => handleInputChange('value', value)}
                placeholder="Valor"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, styles.flexOne]}
                value={draft.value}
              />
            </View>
            <View style={styles.twoColumnRow}>
              <TextInput
                autoCorrect={false}
                keyboardType="numeric"
                onChangeText={(value) => handleInputChange('expected', value)}
                placeholder="Esperado"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, styles.flexOne]}
                value={draft.expected}
              />
              <TextInput
                autoCorrect={false}
                keyboardType="numeric"
                onChangeText={(value) => handleInputChange('measured', value)}
                placeholder="Medido"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, styles.flexOne]}
                value={draft.measured}
              />
            </View>
            <TextInput
              autoCorrect={false}
              keyboardType="numeric"
              onChangeText={(value) => handleInputChange('tolerance', value)}
              placeholder="Tolerancia"
              placeholderTextColor={colors.textSubtle}
              style={styles.darkInput}
              value={draft.tolerance}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleCalculate}
              style={styles.fullWidthPrimary}
              testID="tagwise/calculator/calcular"
            >
              <Text style={styles.fullWidthPrimaryLabel}>Calcular</Text>
            </Pressable>
            {needsRecalculate ? (
              <Text style={styles.smallGhostLabel}>
                Voce mudou um valor. Toque em Calcular novamente para atualizar o resultado.
              </Text>
            ) : null}
          </View>

          {showResult ? (
            <View style={styles.resultPanel}>
              <Text style={styles.kicker}>RESULTADO</Text>
              <Text style={styles.resultPanelTitle}>{result.label}</Text>
              <Text style={styles.resultPanelDetail}>{result.detail}</Text>
              {result.errorPercent !== null ? (
                <Text style={styles.resultPanelDetail}>
                  Erro percentual: {result.errorPercent.toLocaleString('pt-BR')}%
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.connectionCard}>
          <Text style={styles.sectionTitle}>Helper de loop</Text>
          <Text style={styles.pendingText}>
            Modo helper. Nao salva resultado em teste — use o teste de loop dentro do
            instrumento para isso.
          </Text>
          <View style={styles.reportActionGrid}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoopHelperInputMode('pv')}
              style={[
                styles.smallGhostButton,
                loopHelperInputMode === 'pv' ? styles.smallActionButton : null,
              ]}
            >
              <Text
                style={
                  loopHelperInputMode === 'pv'
                    ? styles.smallActionLabel
                    : styles.smallGhostLabel
                }
              >
                Modo PV
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoopHelperInputMode('ma')}
              style={[
                styles.smallGhostButton,
                loopHelperInputMode === 'ma' ? styles.smallActionButton : null,
              ]}
            >
              <Text
                style={
                  loopHelperInputMode === 'ma'
                    ? styles.smallActionLabel
                    : styles.smallGhostLabel
                }
              >
                Modo mA
              </Text>
            </Pressable>
          </View>
          <View style={styles.twoColumnRow}>
            <TextInput
              autoCorrect={false}
              keyboardType="numeric"
              onChangeText={(value) => handleInputChange('processMin', value)}
              placeholder="PV min"
              placeholderTextColor={colors.textSubtle}
              style={[styles.darkInput, styles.flexOne]}
              value={draft.processMin}
            />
            <TextInput
              autoCorrect={false}
              keyboardType="numeric"
              onChangeText={(value) => handleInputChange('processMax', value)}
              placeholder="PV max"
              placeholderTextColor={colors.textSubtle}
              style={[styles.darkInput, styles.flexOne]}
              value={draft.processMax}
            />
          </View>
          <View style={styles.twoColumnRow}>
            <TextInput
              autoCorrect={false}
              onChangeText={(value) => handleInputChange('unit', value)}
              placeholder="Unidade"
              placeholderTextColor={colors.textSubtle}
              style={[styles.darkInput, styles.flexOne]}
              value={draft.unit}
            />
            <TextInput
              autoCorrect={false}
              keyboardType="numeric"
              onChangeText={(value) => handleInputChange('tolerance', value)}
              placeholder="Tolerancia"
              placeholderTextColor={colors.textSubtle}
              style={[styles.darkInput, styles.flexOne]}
              value={draft.tolerance}
            />
          </View>
          <Text style={styles.formLabel}>Quantidade de pontos (1 a 10)</Text>
          <TextInput
            keyboardType="numeric"
            onChangeText={handleLoopPointCountChange}
            placeholder="5"
            placeholderTextColor={colors.textSubtle}
            style={styles.darkInput}
            value={`${loopHelperPoints.length}`}
          />
          {loopHelperPoints.map((point) => (
            <View key={point.id} style={styles.loopPointCard}>
              <View style={styles.loopPointHeader}>
                <Text style={styles.historyTitle}>Ponto {point.setpointPercent}%</Text>
              </View>
              <View style={styles.loopInputGrid}>
                <View style={styles.flexOne}>
                  <Text style={styles.formLabel}>Esperado ({loopHelperInputMode})</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => handleLoopPointChange(point.id, 'expected', value)}
                    placeholder="Esperado"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.darkInput}
                    value={point.expected}
                  />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.formLabel}>Medido ({loopHelperInputMode})</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => handleLoopPointChange(point.id, 'measured', value)}
                    placeholder="Medido"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.darkInput}
                    value={point.measured}
                  />
                </View>
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setLoopShowResult(true)}
            style={styles.fullWidthPrimary}
            testID="tagwise/calculator/calcular-loop"
          >
            <Text style={styles.fullWidthPrimaryLabel}>Calcular loop</Text>
          </Pressable>
          {loopShowResult && loopResult ? (
            <View style={styles.resultPanel}>
              <Text style={styles.kicker}>RESULTADO DO LOOP</Text>
              <Text style={styles.resultPanelTitle}>{loopResult.summary.overallLabel}</Text>
              <Text style={styles.resultPanelDetail}>
                {loopResult.summary.passedCount} aprovados, {loopResult.summary.failedCount}{' '}
                fora da tolerancia, {loopResult.summary.pendingCount} pendentes.
              </Text>
              {loopResult.rows.map((row) => (
                <Text key={row.id} style={styles.resultPanelDetail}>
                  Ponto {row.setpointPercent}%: erro {row.error === null ? 'pendente' : row.error}
                  {row.errorPercent !== null ? ` (${row.errorPercent}%)` : ''} —{' '}
                  {row.passed === null ? 'pendente' : row.passed ? 'OK' : 'falha'}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {canApplyToTest ? (
        <View style={styles.connectionCard}>
          <Text style={styles.sectionTitle}>Usar resultado em teste</Text>
          <InlineMessage text="Escolha exatamente onde aplicar. O app nao assume 50% nem altera o teste sem sua escolha." />
          <PickerChips
            label="Destino"
            options={applyTargets.map((target) => `${target.field}:${target.pointId ?? 'main'}`)}
            value={applyTargetId}
            onChange={onApplyTargetChange}
            labelForOption={(option) =>
              applyTargets.find((target) => `${target.field}:${target.pointId ?? 'main'}` === option)
                ?.label ?? option
            }
          />
          <Pressable accessibilityRole="button" onPress={onApplyToTest} style={styles.fullWidthPrimary}>
            <Text style={styles.fullWidthPrimaryLabel}>Usar este valor em um teste</Text>
          </Pressable>
        </View>
      ) : (
        <InlineMessage text="O teste de loop completo fica dentro do fluxo do instrumento selecionado. Esta calculadora permanece como ferramenta geral." />
      )}
    </>
  );
}

function TechnicianReportsScreen({
  reports,
  onBack,
  onOpenReport,
}: {
  reports: VisualTechnicianReportSummary[];
  onBack: () => void;
  onOpenReport: (report: VisualTechnicianReportSummary) => void;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.screenTitle}>Meus relatorios</Text>
      {reports.length === 0 ? (
        <InlineMessage text="Nenhum rascunho ou envio local foi criado neste aparelho ainda." />
      ) : (
        reports.map((report) => (
          <Pressable
            accessibilityRole="button"
            disabled={!report.canOpen}
            key={report.reportId}
            onPress={() => onOpenReport(report)}
            style={[styles.packageCard, !report.canOpen ? styles.disabledAction : null]}
          >
            <View style={styles.connectionHeader}>
              <View style={styles.flexOne}>
                <Text style={styles.templateTitle}>{report.tagCode}</Text>
                <Text style={styles.templateBody}>{report.title}</Text>
              </View>
              <StatusPill label={report.statusLabel} severity={reportStatusSeverity(report.status)} />
            </View>
            <Text style={styles.connectionBody}>{report.detail}</Text>
            <Text style={styles.historySubtitle}>Atualizado: {report.updatedAtLabel}</Text>
            {report.canEdit ? (
              <Text style={styles.connectionMessage}>Editavel enquanto estiver local ou pendente de sync.</Text>
            ) : null}
          </Pressable>
        ))
      )}
    </>
  );
}

function PickerChips({
  labelForOption,
  label,
  options,
  value,
  onChange,
}: {
  labelForOption?: (value: string) => string;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.pickerBlock}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.pickerChipRow}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              accessibilityRole="button"
              key={option}
              onPress={() => onChange(option)}
              style={[styles.pickerChip, active ? styles.pickerChipActive : null]}
            >
              <Text style={[styles.pickerChipText, active ? styles.pickerChipTextActive : null]}>
                {labelForOption ? labelForOption(option) : modeLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function QrResolutionPanel({
  manualPayload,
  qrScanResult,
  scannerVisible,
  onBarcodeScanned,
  onCancel,
  onManualPayloadChange,
  onResolveManualPayload,
}: {
  manualPayload: string;
  qrScanResult: LocalQrScanResult | null;
  scannerVisible: boolean;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
  onCancel: () => void;
  onManualPayloadChange: (value: string) => void;
  onResolveManualPayload: () => void;
}) {
  if (!scannerVisible && !qrScanResult) {
    return null;
  }

  return (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View>
          <Text style={styles.connectionTitle}>QR local</Text>
          <Text style={styles.connectionBody}>
            Resolve tags baixadas no dispositivo. Cole o payload se a camera nao estiver disponivel.
          </Text>
        </View>
        <StatusPill
          label={qrScanResult?.state === 'hit' ? 'OK' : qrScanResult ? 'Atencao' : 'Scan'}
          severity={qrScanResult?.state === 'hit' ? 'ok' : qrScanResult ? 'due' : 'medium'}
        />
      </View>

      {scannerVisible ? (
        <View style={styles.cameraFrame}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcodeScanned}
            style={styles.cameraView}
          />
        </View>
      ) : null}

      {qrScanResult ? (
        <View style={styles.qrResultBlock}>
          <Text style={styles.connectionMessage}>{qrScanResult.message}</Text>
          {'guidance' in qrScanResult ? (
            <Text style={styles.qrGuidanceText}>{qrScanResult.guidance}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.loginGrid}>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={onManualPayloadChange}
          placeholder="Cole tag, tagwise://tag/... ou JSON"
          placeholderTextColor={colors.textSubtle}
          style={styles.darkInput}
          value={manualPayload}
        />
        <View style={styles.connectionActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onResolveManualPayload}
            style={styles.smallActionButton}
          >
            <Text style={styles.smallActionLabel}>Resolver localmente</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.smallGhostButton}>
            <Text style={styles.smallGhostLabel}>Fechar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EmptyCatalogState({
  onRefreshPackages,
  packageBusy,
}: {
  onRefreshPackages: () => void;
  packageBusy: boolean;
}) {
  return (
    <View style={styles.connectionCard}>
      <Text style={styles.connectionTitle}>Nenhuma tag baixada</Text>
      <Text style={styles.connectionBody}>
        Baixe ou atualize um pacote conectado para abrir tags reais offline. O shell visual nao
        substitui tags autenticadas por dados de demo.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={packageBusy}
        onPress={onRefreshPackages}
        style={[styles.smallActionButton, packageBusy ? styles.disabledAction : null]}
      >
        <Text style={styles.smallActionLabel}>
          {packageBusy ? 'Atualizando...' : 'Atualizar pacotes'}
        </Text>
      </Pressable>
    </View>
  );
}

function ConnectionCard({
  apiBaseUrl,
  authBusy,
  authMessage,
  email,
  packageBusy,
  packageSummary,
  password,
  session,
  source,
  onEmailChange,
  onPasswordChange,
  onRefreshPackages,
  onSignIn,
  onSwitchUser,
}: {
  apiBaseUrl: string;
  authBusy: boolean;
  authMessage: string | null;
  email: string;
  packageBusy: boolean;
  packageSummary: { packageCount: number; downloadedCount: number };
  password: string;
  session: ActiveUserSession | null;
  source: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRefreshPackages: () => void;
  onSignIn: () => void;
  onSwitchUser: () => void;
}) {
  return (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View>
          <Text style={styles.connectionTitle}>
            {session ? `Sessao ${session.connectionMode}` : 'Modo demo local'}
          </Text>
          <Text style={styles.connectionBody}>
            {session
              ? `${session.displayName} - ${packageSummary.downloadedCount}/${packageSummary.packageCount} pacote(s) offline`
              : `Fluxo visual disponivel offline. Login conectado usa ${apiBaseUrl}.`}
          </Text>
        </View>
        <StatusPill label={source === 'seeded-demo' ? 'Seed' : 'Local'} severity="ok" />
      </View>

      {authMessage ? <Text style={styles.connectionMessage}>{authMessage}</Text> : null}

      {session ? (
        <View style={styles.connectionActionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={packageBusy || session.connectionMode !== 'connected'}
            onPress={onRefreshPackages}
            style={[
              styles.smallActionButton,
              packageBusy || session.connectionMode !== 'connected' ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.smallActionLabel}>
              {packageBusy ? 'Atualizando...' : 'Atualizar pacotes'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSwitchUser} style={styles.smallGhostButton}>
            <Text style={styles.smallGhostLabel}>Trocar usuario</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.loginGrid}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={onEmailChange}
            placeholder="Email"
            placeholderTextColor={colors.textSubtle}
            style={styles.darkInput}
            value={email}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onPasswordChange}
            placeholder="Senha"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={styles.darkInput}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={authBusy}
            onPress={onSignIn}
            style={[styles.smallActionButton, authBusy ? styles.disabledAction : null]}
          >
            <Text style={styles.smallActionLabel}>{authBusy ? 'Entrando...' : 'Entrar'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Story 9.4: supervisor / manager tile that opens the create-package overlay.
// Rendered next to ReviewAccessCard on the supervisor dashboard.
function SupervisorAuthoringAccessCard({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View>
          <Text style={styles.connectionTitle}>Criar pacote de trabalho</Text>
          <Text style={styles.connectionBody}>
            Selecione instrumentos do catalogo e atribua um pacote a um tecnico.
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={styles.smallActionButton}
      >
        <Text style={styles.smallActionLabel}>Criar pacote</Text>
      </Pressable>
    </View>
  );
}

function ReviewAccessCard({
  access,
  busy,
  queueCount,
  onOpenReview,
}: {
  access: ReturnType<typeof buildVisualReviewAccess>;
  busy: boolean;
  queueCount: number;
  onOpenReview: () => void;
}) {
  return (
    <View style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View>
          <Text style={styles.connectionTitle}>{access.label}</Text>
          <Text style={styles.connectionBody}>{access.detail}</Text>
        </View>
        <StatusPill
          label={access.state === 'available' ? `${queueCount}` : 'Online'}
          severity={access.state === 'available' ? 'ok' : 'due'}
        />
      </View>
      {access.state === 'available' ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onOpenReview}
          style={[styles.smallActionButton, busy ? styles.disabledAction : null]}
        >
          <Text style={styles.smallActionLabel}>
            {busy ? 'Carregando revisao...' : 'Abrir fila de revisao'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.connectionMessage}>{access.detail}</Text>
      )}
    </View>
  );
}

function TagDetailScreen({
  lastValueLabel,
  selectedExecutionTemplateId,
  selectedTag,
  selectedTagContext,
  variableRangeLabel,
  onAttachInstrumentPhoto,
  onBack,
  onOpenCalculator,
  onOpenHistory,
  onSelectExecutionTemplate,
  executionTemplateStatuses,
  photoAttachments,
  approvedReportLock,
}: {
  lastValueLabel: string;
  selectedExecutionTemplateId: string | null;
  selectedTag: VisualTagSummary;
  selectedTagContext: LocalTagContext | null;
  executionTemplateStatuses: readonly SharedExecutionTemplateStatus[];
  // Story 8.12 finding #1: the detail screen's "Foto do instrumento"
  // panel now renders captured instrument-level photos so the
  // technician can see what they shot before continuing.
  photoAttachments: readonly SharedExecutionPhotoAttachment[];
  // Story 8.14 finding #5: when true, this tag already has an approved
  // report under the current package version. The detail screen locks
  // the test affordances; the user must wait for the next package.
  approvedReportLock: boolean;
  variableRangeLabel: string;
  // Story 8.8 D-03 / Story 8.10 #4: instrument-level photo. The handler now
  // attaches without requiring a template selection (Story 8.10 ungated this).
  // When no template is yet selected, the parent handler picks a default
  // template silently so the photo still lands in the per-tag report context.
  onAttachInstrumentPhoto: (source: 'camera' | 'library') => void;
  onBack: () => void;
  // Story 8.10 redesign: only `onOpenCalculator` (standalone helper) and
  // `onOpenHistory` (the entry into the sequential Comparar -> Checklist ->
  // Relatorio pipeline) are reachable from the detail screen now. The prior
  // `onOpenCalculation` / `onOpenDiagnosis` / `onOpenReport` action tiles
  // were removed because they implied parallel actions; the new flow is
  // strictly sequential through the pipeline.
  onOpenCalculator: () => void;
  onOpenHistory: () => void;
  onSelectExecutionTemplate: (templateId: string) => void;
}) {
  const subtitle = selectedTagContext
    ? `${selectedTagContext.instrumentFamily.value} - ${selectedTagContext.instrumentSubtype.value}`
    : selectedTag.description;
  const statusLabel =
    selectedTagContext?.criticality.state === 'available'
      ? selectedTagContext.criticality.value.toUpperCase()
      : selectedTag.severity === 'high'
      ? 'Falha'
      : 'Local';
  const templates = selectedTagContext?.referencePointers.executionTemplates ?? [];

  return (
    <>
      <ScreenHeader onBack={onBack} />
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.tagHeroTitle}>{selectedTag.code}</Text>
          <Text style={styles.tagHeroSubtitle}>{subtitle}</Text>
        </View>
        <StatusPill label={statusLabel} severity={selectedTag.severity} large />
      </View>

      {/* Story 8.8 D-05: instrument detail metric panel rendered as vertical
          title-over-value blocks so long asset references, areas, and due
          dates do not wrap mid-row on narrow Android phones. */}
      <View style={styles.metricPanel}>
        <MetricLine label="Faixa" value={variableRangeLabel} variant="vertical" />
        <View style={styles.separator} />
        <MetricLine
          label="Tolerancia"
          value={selectedTagContext?.tolerance.value ?? 'Indisponivel'}
          variant="vertical"
        />
        <View style={styles.separator} />
        <MetricLine label="Ultimo valor" value={lastValueLabel} variant="vertical" />
        <View style={styles.separator} />
        <MetricLine
          label="Area"
          value={selectedTagContext?.area.value ?? selectedTag.area}
          variant="vertical"
        />
        <View style={styles.separator} />
        <MetricLine
          label="Ativo"
          value={selectedTagContext?.parentAssetReference.value ?? selectedTag.badgeDetail}
          variant="vertical"
        />
        <View style={styles.separator} />
        <MetricLine
          label="Vencimento"
          value={selectedTagContext?.dueIndicator.value ?? 'Indisponivel'}
          variant="vertical"
        />
      </View>

      <View style={styles.twoColumnRow}>
        <InfoPill icon="!" label={selectedTagContext?.historyPreview.title ?? 'Historico indisponivel'} />
        <InfoPill
          icon="!"
          label={selectedTagContext?.dueIndicator.value ?? 'Vencimento indisponivel'}
          warning={selectedTagContext?.dueIndicator.overdue ?? false}
        />
      </View>

      {/* Story 8.14 finding #5: when this tag already has an approved
          report in the current package, lock the test affordances.
          The lock clears when a new package version arrives (after the
          supervisor releases the next package); the technician can
          still review the existing data via the Compare / Report flow. */}
      {approvedReportLock ? (
        <View style={styles.invalidatedBanner}>
          <Text style={styles.invalidatedBannerTitle}>
            Instrumento concluido nesta versao do pacote
          </Text>
          <Text style={styles.invalidatedBannerBody}>
            Este instrumento ja tem relatorio aprovado pelo supervisor para o
            pacote atual. Os testes ficam bloqueados ate o proximo pacote ser
            disponibilizado. Voce ainda pode revisar o historico e o relatorio.
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionBand}>
        <SectionHeader title="Escolher teste" />
        {templates.length > 0 ? (
          templates.map((template) => {
            const selected = template.id === selectedExecutionTemplateId;
            const pattern = resolveVisualExecutionPattern(template);
            // Story 8.11: a per-template badge shows the saved acceptance
            // status from prior runs in this visit ("Concluido" / "Falha"
            // / "Em andamento"). If the technician has not saved a
            // calculation yet, the badge falls back to "Iniciar".
            const savedStatus = executionTemplateStatuses.find(
              (entry) => entry.templateId === template.id,
            );
            const badge = resolveTemplateStatusBadge(savedStatus, selected);
            return (
              <Pressable
                accessibilityRole="button"
                disabled={approvedReportLock}
                key={template.id}
                onPress={() => onSelectExecutionTemplate(template.id)}
                style={[styles.templateRow, selected ? styles.templateRowSelected : null]}
              >
                <View style={styles.flexOne}>
                  <Text style={styles.templateTitle}>{toPtBrTemplateLabel(template.title)}</Text>
                  <Text style={styles.templateBody}>
                    {pattern.label} - {toPtBrTemplateLabel(template.testPattern)}
                  </Text>
                  <Text style={styles.historySubtitle}>{pattern.detail}</Text>
                </View>
                <StatusPill label={badge.label} severity={badge.severity} />
              </Pressable>
            );
          })
        ) : (
          <InlineMessage text="Nenhum template local disponivel para esta tag." />
        )}
        {/* Story 8.10 finding #3: the two result tiles are now
            informational only (no Pressable wrapper). They show the current
            readiness state and the previous-cycle history outcome, but the
            navigation actions live in the "Avancar para Comparacao" button
            below to enforce the sequential pipeline. */}
        <View style={styles.resultGrid}>
          <View style={styles.resultTile}>
            <Text style={styles.resultIcon}>✓</Text>
            <Text style={styles.resultTitle}>
              {selectedExecutionTemplateId ? 'Pronto para medir' : 'Selecione um teste'}
            </Text>
            <Text style={styles.resultSubtitle}>
              {selectedExecutionTemplateId ? 'toque na lista acima' : 'lista acima'}
            </Text>
          </View>
          <View style={styles.resultTile}>
            <Text style={styles.resultIcon}>▥</Text>
            <Text style={styles.resultTitle}>
              {toHistoryResultLabel(selectedTagContext?.historyPreview.lastResult)}
            </Text>
            <Text style={styles.resultSubtitle}>{selectedTagContext?.historyPreview.state ?? 'demo'}</Text>
          </View>
        </View>
      </View>

      {/* Story 8.10 findings #1 + #3 + #10: the instrument screen is the
          HUB. Tests are run from the template list above; after saving a
          test the user returns here to pick the next one. Once finished,
          "Avancar para Comparacao" enters the sequential phase pipeline:
          Comparar -> Checklist -> Relatorio. The standalone Calculadora
          remains accessible as a helper. The parallel "Comparar /
          Diagnosticar / Registrar" tiles from prior stories were removed
          because they implied parallel actions; the new flow is
          strictly sequential. */}
      <View style={styles.reportActionGrid}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenCalculator}
          style={styles.smallGhostButton}
        >
          <Text style={styles.smallGhostLabel}>Calculadora</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenHistory}
          style={styles.smallActionButton}
        >
          <Text style={styles.smallActionLabel}>Avancar para Comparacao</Text>
        </Pressable>
      </View>

      {/* Story 8.10 finding #4: the instrument photo is always available on
          the detail screen. The handler attaches the photo against the
          execution shell when one exists (template selected); when no
          template is yet selected, the parent handler picks the first
          available template silently so the photo still lands in the
          per-tag report context with `executionStepIdOverride: 'instrument'`. */}
      <View style={styles.nextActionPanel}>
        <Text style={styles.pendingTitle}>Foto do instrumento</Text>
        <Text style={styles.pendingText}>
          Anexe foto da placa, fiacao, instalacao ou condicao fisica do instrumento.
          Voce pode adicionar a observacao no relatorio.
        </Text>
        <View style={styles.reportActionGrid}>
          <Pressable
            accessibilityRole="button"
            disabled={approvedReportLock}
            onPress={() => onAttachInstrumentPhoto('camera')}
            style={[
              styles.smallActionButton,
              approvedReportLock ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.smallActionLabel}>Tirar foto</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={approvedReportLock}
            onPress={() => onAttachInstrumentPhoto('library')}
            style={[
              styles.smallGhostButton,
              approvedReportLock ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.smallGhostLabel}>Da galeria</Text>
          </Pressable>
        </View>
        {/* Story 8.12 finding #1: instrument-level photo preview row.
            Filters captured photos by `executionStepId === 'instrument'`
            so only instrument-tagged shots render here. */}
        <PhotoThumbnailRow
          photos={photoAttachments}
          filterStepKind="instrument"
          fallbackCaption="Instrumento"
        />
      </View>
    </>
  );
}

function ServiceCalculationScreen({
  calculation,
  stages,
  selectedTag,
  shellMessage,
  // Story 8.10 finding #5: pass the shell's photo list so the photo-actions
  // section can render thumbnails of already-captured photos.
  photoAttachments,
  onAttachExecutionPhoto,
  onBack,
  onOpenCalculator,
  onOpenStage,
  onInputChange,
  onSaveCalculation,
}: {
  calculation: VisualExecutionCalculationViewModel;
  stages: VisualExecutionStage[];
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  photoAttachments: readonly SharedExecutionPhotoAttachment[];
  onAttachExecutionPhoto: (source: 'camera' | 'library', contextNote: string | null) => void;
  onBack: () => void;
  onOpenCalculator: () => void;
  onOpenStage: (route: VisualStageRoute) => void;
  onInputChange: (key: 'expectedValue' | 'observedValue', value: string) => void;
  onSaveCalculation: () => void;
}) {
  const [conversionValue, setConversionValue] = useState(
    calculation.expectedValue || calculation.observedValue || '50',
  );
  const [conversionResult, setConversionResult] = useState<VisualLoopConversionResult | null>(
    null,
  );

  useEffect(() => {
    setConversionValue(calculation.expectedValue || calculation.observedValue || '50');
    setConversionResult(null);
  }, [calculation.expectedValue, calculation.observedValue, calculation.tagCode]);

  if (calculation.state !== 'available') {
    return (
      <ExecutionUnavailableScreen
        message={shellMessage}
        onBack={onBack}
        title="Calculo local indisponivel"
        unavailableReason={calculation.unavailableReason}
      />
    );
  }

  function handleConvert(mode: VisualLoopConversionMode) {
    setConversionResult(convertLoopValue(calculation.conversion, mode, conversionValue));
  }

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <ExecutionStageStepper activeRoute="calculation" stages={stages} onOpenStage={onOpenStage} />
      <Text style={styles.tagHeroTitle}>{calculation.tagCode || selectedTag.code}</Text>
      <Text style={styles.tagHeroSubtitle}>{calculation.templateTitle}</Text>

      <View style={styles.selectBox}>
        <Text style={styles.selectText}>{calculation.modeLabel}</Text>
        <StatusPill
          label={calculation.result?.acceptanceLabel ?? 'PENDENTE'}
          severity={calculation.result?.acceptanceSeverity ?? 'medium'}
        />
      </View>

      <Text style={styles.formLabel}>{calculation.expectedLabel}</Text>
      <TextInput
        editable={calculation.editable}
        keyboardType="numeric"
        onChangeText={(value) => onInputChange('expectedValue', value)}
        placeholder={calculation.expectedLabel}
        placeholderTextColor={colors.textSubtle}
        style={[styles.darkInput, !calculation.editable ? styles.disabledAction : null]}
        value={calculation.expectedValue}
      />

      <Text style={styles.formLabel}>{calculation.observedLabel}</Text>
      <TextInput
        editable={calculation.editable}
        keyboardType="numeric"
        onChangeText={(value) => onInputChange('observedValue', value)}
        placeholder={calculation.observedLabel}
        placeholderTextColor={colors.textSubtle}
        style={[styles.darkInput, !calculation.editable ? styles.disabledAction : null]}
        value={calculation.observedValue}
      />

      <View style={styles.executionMetricGrid}>
        <ExecutionMetric label="Unidade" value={calculation.unitLabel} />
        <ExecutionMetric label="Faixa" value={calculation.rangeLabel} />
        <ExecutionMetric label="Tolerancia" value={calculation.toleranceLabel} />
        <ExecutionMetric label="Aceite" value={calculation.acceptanceLabel} />
        <ExecutionMetric label="Base conversao" value={calculation.conversionBasisLabel} />
        <ExecutionMetric label="Faixa esperada" value={calculation.expectedRangeLabel} />
      </View>

      <View style={styles.failureBar}>
        <Text style={styles.failureBarText}>
          {calculation.result
            ? `Erro: ${calculation.result.absoluteDeviationLabel}`
            : 'Informe valores e salve para calcular localmente'}
        </Text>
        <StatusPill
          label={calculation.result?.acceptanceLabel ?? 'LOCAL'}
          severity={calculation.result?.acceptanceSeverity ?? 'medium'}
        />
      </View>
      {calculation.result ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>{calculation.result.acceptanceReason}</Text>
          <Text style={styles.pendingText}>
            Desvio assinado: {calculation.result.signedDeviationLabel}
          </Text>
          <Text style={styles.pendingText}>
            Percentual do span: {calculation.result.percentOfSpanLabel}
          </Text>
          <Text style={styles.pendingText}>Salvo em: {calculation.updatedAtLabel}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!calculation.editable}
        onPress={onSaveCalculation}
        style={[styles.fullWidthPrimary, !calculation.editable ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Salvar calculo local</Text>
      </Pressable>
      <ExecutionPhotoActions
        contextNote={null}
        editable={calculation.editable}
        onAttach={onAttachExecutionPhoto}
        photos={photoAttachments}
        filterStepKind="calculation"
      />
      {/* Story 11.2 (issue #2 follow-up): the "Proximo passo" panel was
          fully removed from the test execution screen. Comparison,
          checklist and calculator are reachable from the instrument hub
          (the tag detail screen) and from the home dashboard. The test
          screen is single-purpose: enter values, calculate, save. */}

      <Text style={styles.sectionTitle}>Conversao offline</Text>
      <Text style={styles.pendingText}>{calculation.conversion.reason}</Text>
      <TextInput
        keyboardType="numeric"
        onChangeText={setConversionValue}
        placeholder="Valor para converter"
        placeholderTextColor={colors.textSubtle}
        style={styles.darkInput}
        value={conversionValue}
      />
      <View style={styles.conversionGrid}>
        <ConversionButton label="PV para mA" onPress={() => handleConvert('process-to-milliamp')} />
        <ConversionButton label="mA para PV" onPress={() => handleConvert('milliamp-to-process')} />
        <ConversionButton label="PV para %" onPress={() => handleConvert('process-to-percent')} />
        <ConversionButton label="mA para %" onPress={() => handleConvert('milliamp-to-percent')} />
        <ConversionButton label="% para mA" onPress={() => handleConvert('percent-to-milliamp')} />
      </View>
      {conversionResult ? (
        <View style={styles.conversionResultCard}>
          <Text style={styles.historyTitle}>{conversionResult.label}</Text>
          <Text style={styles.pendingText}>{conversionResult.detail}</Text>
        </View>
      ) : null}
      {/* Story 8.10 findings #1 + #9: per-test screen no longer renders a
          "Proximo" button — the Salvar handler pops back to detail
          automatically. Voltar + Inicio remain for explicit navigation. */}
      <NavigationAffordanceRow />
    </>
  );
}

function LoopExecutionScreen({
  calculation,
  inputMode,
  points,
  photoAttachments,
  selectedTag,
  shellMessage,
  stages,
  onAttachExecutionPhoto,
  onBack,
  onInputModeChange,
  onOpenCalculator,
  onOpenStage,
  onPointChange,
  onPointCountChange,
  onSaveLoop,
}: {
  calculation: VisualExecutionCalculationViewModel;
  inputMode: LoopPointInputMode;
  points: LoopTestPoint[];
  // Story 8.12 finding #1: thumbnails of photos already captured per
  // loop point, filtered inline by contextNote like
  // "Ponto de loop 50%". Source comes from `executionShell?.evidence.
  // photoAttachments` at the parent call site.
  photoAttachments: readonly SharedExecutionPhotoAttachment[];
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  stages: VisualExecutionStage[];
  onAttachExecutionPhoto: (source: 'camera' | 'library', contextNote: string | null) => void;
  onBack: () => void;
  onInputModeChange: (mode: LoopPointInputMode) => void;
  onOpenCalculator: () => void;
  onOpenStage: (route: VisualStageRoute) => void;
  onPointChange: (pointId: string, key: 'expected' | 'measured', value: string) => void;
  onPointCountChange: (value: string) => void;
  onSaveLoop: () => void;
}) {
  const processMin = resolveLoopProcessMin(calculation);
  const processMax = resolveLoopProcessMax(calculation);
  const tolerance = resolveLoopTolerance(calculation);
  const unit = resolveLoopUnit(calculation);
  const result = calculateLoopTest({
    points,
    inputMode,
    processMin,
    processMax,
    tolerance,
  });

  if (calculation.state !== 'available') {
    return (
      <ExecutionUnavailableScreen
        message={shellMessage}
        onBack={onBack}
        title="Teste de loop indisponivel"
        unavailableReason={calculation.unavailableReason}
      />
    );
  }

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <ExecutionStageStepper activeRoute="loop-test" stages={stages} onOpenStage={onOpenStage} />
      <Text style={styles.tagHeroTitle}>{calculation.tagCode || selectedTag.code}</Text>
      <Text style={styles.tagHeroSubtitle}>Teste de loop do instrumento</Text>

      <View style={styles.nextActionPanel}>
        <Text style={styles.pendingTitle}>Pontos do teste</Text>
        <Text style={styles.pendingText}>
          Comece com 5 pontos e ajuste ate 10 quando o procedimento pedir. A calculadora fica como apoio, mas o teste completo fica aqui.
        </Text>
        <View style={styles.reportActionGrid}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onInputModeChange('pv')}
            style={[styles.smallGhostButton, inputMode === 'pv' ? styles.smallActionButton : null]}
          >
            <Text style={inputMode === 'pv' ? styles.smallActionLabel : styles.smallGhostLabel}>Modo PV</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onInputModeChange('ma')}
            style={[styles.smallGhostButton, inputMode === 'ma' ? styles.smallActionButton : null]}
          >
            <Text style={inputMode === 'ma' ? styles.smallActionLabel : styles.smallGhostLabel}>Modo mA</Text>
          </Pressable>
        </View>
        <Text style={styles.formLabel}>Quantidade de pontos</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={onPointCountChange}
          placeholder="5"
          placeholderTextColor={colors.textSubtle}
          style={styles.darkInput}
          value={`${points.length}`}
        />
      </View>

      <View style={styles.executionMetricGrid}>
        <ExecutionMetric label="Faixa" value={`${processMin || '?'} a ${processMax || '?'} ${unit}`} />
        <ExecutionMetric label="Tolerancia" value={tolerance ? `${tolerance} ${inputMode}` : calculation.toleranceLabel} />
        <ExecutionMetric label="Resultado" value={loopSummaryLabel(result.summary.state, result.summary.overallLabel)} />
        <ExecutionMetric label="Base" value={calculation.conversionBasisLabel} />
      </View>

      {result.rows.map((row, index) => (
        <View key={row.id} style={styles.loopPointCard}>
          <View style={styles.loopPointHeader}>
            <Text style={styles.historyTitle}>Ponto {index + 1} - {row.setpointPercent}%</Text>
            <StatusPill
              label={loopPointStatusLabel(row.passed)}
              severity={row.passed === false ? 'high' : row.passed === true ? 'ok' : 'medium'}
            />
          </View>
          <View style={styles.loopInputGrid}>
            <View style={styles.flexOne}>
              <Text style={styles.formLabel}>Esperado ({inputMode})</Text>
              <TextInput
                editable={calculation.editable}
                keyboardType="numeric"
                onChangeText={(value) => onPointChange(row.id, 'expected', value)}
                placeholder="Esperado"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, !calculation.editable ? styles.disabledAction : null]}
                value={row.expected}
              />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.formLabel}>Medido ({inputMode})</Text>
              <TextInput
                editable={calculation.editable}
                keyboardType="numeric"
                onChangeText={(value) => onPointChange(row.id, 'measured', value)}
                placeholder="Medido"
                placeholderTextColor={colors.textSubtle}
                style={[styles.darkInput, !calculation.editable ? styles.disabledAction : null]}
                value={row.measured}
              />
            </View>
          </View>
          <Text style={styles.pendingText}>
            PV esperado {formatNullableNumber(row.expectedPv)} {unit} | mA esperado {formatNullableNumber(row.expectedMa)}
          </Text>
          <Text style={styles.pendingText}>
            PV medido {formatNullableNumber(row.measuredPv)} {unit} | mA medido {formatNullableNumber(row.measuredMa)}
          </Text>
          <Text style={styles.pendingText}>
            Percentual medido {formatNullableNumber(row.measuredPercent)}% | Erro {formatNullableNumber(row.error)} {inputMode} ({formatNullableNumber(row.errorPercent)}%)
          </Text>
          {/* Story 8.7 AC 7: per-loop-point camera/gallery so a photo taken
              when an instrument misbehaves at e.g. 50% carries that context
              through to the report evidence area. */}
          <View style={styles.reportActionGrid}>
            <Pressable
              accessibilityRole="button"
              disabled={!calculation.editable}
              onPress={() =>
                onAttachExecutionPhoto('camera', `Ponto de loop ${row.setpointPercent}%`)
              }
              style={[
                styles.smallActionButton,
                !calculation.editable ? styles.disabledAction : null,
              ]}
            >
              <Text style={styles.smallActionLabel}>Foto ponto {row.setpointPercent}%</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!calculation.editable}
              onPress={() =>
                onAttachExecutionPhoto('library', `Ponto de loop ${row.setpointPercent}%`)
              }
              style={[
                styles.smallGhostButton,
                !calculation.editable ? styles.disabledAction : null,
              ]}
            >
              <Text style={styles.smallGhostLabel}>Galeria</Text>
            </Pressable>
          </View>
          {/* Story 8.12 finding #1: per-point thumbnail row. Filters by
              the contextNote that the capture path stamped on each
              photo so the 50% row only shows 50% photos, etc. */}
          <PhotoThumbnailRow
            photos={photoAttachments}
            filterContextNote={`Ponto de loop ${row.setpointPercent}%`}
            fallbackCaption={`Ponto ${row.setpointPercent}%`}
          />
        </View>
      ))}

      <View style={styles.nextActionPanel}>
        <Text style={styles.pendingTitle}>Resumo do teste</Text>
        <Text style={styles.pendingText}>
          {result.summary.passedCount} aprovados, {result.summary.failedCount} fora da tolerancia, {result.summary.pendingCount} pendentes.
        </Text>
        <View style={styles.reportActionGrid}>
          <Pressable accessibilityRole="button" onPress={onOpenCalculator} style={styles.smallGhostButton}>
            <Text style={styles.smallGhostLabel}>Abrir calculadora</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!calculation.editable}
            onPress={onSaveLoop}
            style={[styles.smallActionButton, !calculation.editable ? styles.disabledAction : null]}
          >
            <Text style={styles.smallActionLabel}>Salvar loop</Text>
          </Pressable>
        </View>
      </View>
      {/* Story 8.10 findings #1 + #9: loop-test no longer renders a Proximo
          button; Salvar pops back to detail. */}
      <NavigationAffordanceRow />
    </>
  );
}

function DemoCalculationScreen({
  calculation,
  selectedTag,
  onBack,
}: {
  calculation: ReturnType<typeof buildTechnicianVisualWorkflow>['calculation'];
  selectedTag: VisualTagSummary;
  onBack: () => void;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.tagHeroTitle}>{selectedTag.code}</Text>
      <Text style={styles.tagHeroSubtitle}>Transmissor de pressao vapor</Text>

      <View style={styles.selectBox}>
        <Text style={styles.selectText}>{calculation.mode}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </View>

      <Text style={styles.formLabel}>Valor Esperado</Text>
      <View style={styles.unitToggleRow}>
        <StatusPill label="mA" severity="medium" />
        <StatusPill label="%" severity="medium" />
      </View>
      <View style={styles.calculationValueRow}>
        <Text style={styles.bigValue}>{formatNumber(calculation.expectedValue)} {calculation.unit}</Text>
        <Text style={styles.bigValue}>{formatNumber(calculation.observedValue)} {calculation.unit}</Text>
      </View>

      <View style={styles.toleranceRow}>
        <Text style={styles.toleranceIcon}>▰</Text>
        <Text style={styles.toleranceLabel}>Tolerancia</Text>
        <Text style={styles.toleranceValue}>± {formatNumber(calculation.tolerance)} {calculation.unit}</Text>
      </View>

      <View style={styles.failureBar}>
        <Text style={styles.failureBarText}>
          Erro: {formatNumber(calculation.absoluteError)} {calculation.unit}
        </Text>
        <StatusPill label={calculation.statusLabel} severity="high" />
      </View>

      <View style={styles.bottomActionRow}>
        <GhostTile label="PV → mA" />
        <GhostTile label="mA → %" />
        <GhostTile label="Converter" />
      </View>
    </>
  );
}

function ServiceHistoryScreen({
  activePointId,
  history,
  pointOptions,
  priorReadings,
  selectedTag,
  shellMessage,
  stages,
  onBack,
  onOpenStage,
  onPointChange,
  onOpenDiagnosis,
}: {
  activePointId: string;
  history: VisualExecutionHistoryViewModel;
  pointOptions: VisualHistoryPointOption[];
  priorReadings: readonly LocalTagPriorTestReading[];
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  stages: VisualExecutionStage[];
  onBack: () => void;
  onOpenStage: (route: VisualStageRoute) => void;
  onPointChange: (value: string) => void;
  onOpenDiagnosis: () => void;
}) {
  const selectedPoint =
    pointOptions.find((option) => option.id === activePointId) ?? pointOptions[0] ?? null;
  const priorReadingsForPoint = selectPriorReadingsForPoint(priorReadings, selectedPoint);

  // Story 8.13 finding #2: the Compare screen consumes per-tag history
  // (priorReadings) directly from selectedTagContext. If neither the
  // execution-shell-derived rows NOR any priorReadings exist, fall back
  // to the unavailable screen; otherwise render the panel even when no
  // test template has been opened.
  if (
    history.state === 'unavailable' &&
    history.rows.length === 0 &&
    priorReadings.length === 0
  ) {
    return (
      <ExecutionUnavailableScreen
        message={shellMessage}
        onBack={onBack}
        title="Historico local indisponivel"
        unavailableReason={history.unavailableReason}
      />
    );
  }

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <ExecutionStageStepper activeRoute="history" stages={stages} onOpenStage={onOpenStage} />
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.tagHeroTitle}>{history.tagCode || selectedTag.code}</Text>
          <Text style={styles.tagHeroSubtitle}>{history.title}</Text>
        </View>
        <StatusPill
          label={history.historyStateLabel}
          severity={history.state === 'missing' ? 'due' : history.state === 'unavailable' ? 'medium' : 'ok'}
          large
        />
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Comparacao historica</Text>
            <Text style={styles.currentComparisonValue}>
              {selectedPoint?.label ?? history.currentResultLabel}
            </Text>
          </View>
          <StatusPill
            label={history.currentResultSeverity === 'high' ? 'FALHA' : 'LOCAL'}
            severity={history.currentResultSeverity}
          />
        </View>
        {pointOptions.length > 1 ? (
          <ScrollView
            contentContainerStyle={styles.chipRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {pointOptions.map((option) => (
              <FilterChip
                active={option.id === selectedPoint?.id}
                key={option.id}
                label={option.label}
                onPress={() => onPointChange(option.id)}
              />
            ))}
          </ScrollView>
        ) : null}
        {/* Story 8.13 finding #6: chart bars are now sourced from the
            per-tag priorReadings (multi-point history from the
            package snapshot), not the empty current-execution rows.
            Each bar = one past test session's reading at the selected
            point. Bar height encodes deviation magnitude relative to
            the worst observed deviation; color goes hot when the
            reading was pass-with-note or fail. */}
        {priorReadingsForPoint.length > 0 ? (
          <View style={styles.chartRail}>
            {(() => {
              const maxAbs = Math.max(
                ...priorReadingsForPoint.map((r) => Math.abs(r.signedDeviation)),
                0.0001,
              );
              return priorReadingsForPoint
                .slice()
                .reverse()
                .slice(0, 6)
                .map((reading) => {
                  const height = 28 + Math.min(60, (Math.abs(reading.signedDeviation) / maxAbs) * 60);
                  const hot = reading.result !== 'pass';
                  const dateLabel = formatPriorReadingDate(reading.observedAt);
                  return (
                    <View key={reading.id} style={styles.chartPointColumn}>
                      <View
                        style={[
                          styles.chartBar,
                          { height },
                          hot ? styles.chartBarHot : null,
                        ]}
                      />
                      <View
                        style={[styles.chartDot, hot ? styles.chartDotHot : null]}
                      />
                      <Text style={styles.chartLabel}>{dateLabel}</Text>
                    </View>
                  );
                });
            })()}
          </View>
        ) : (
          // Story 8.13 finding #6: keep the diagnosis-link affordance
          // for the truly empty case (no priorReadings for this tag at
          // all OR at this point).
          <Pressable
            accessibilityRole="button"
            onPress={onOpenDiagnosis}
            style={styles.pendingCard}
          >
            <Text style={styles.pendingTitle}>
              {priorReadings.length === 0
                ? 'Sem leituras anteriores em cache para esta tag.'
                : 'Sem leituras anteriores no ponto selecionado. Troque o ponto para ver outras medicoes.'}
            </Text>
            <Text style={styles.smallGhostLabel}>Tocar para justificar no checklist</Text>
          </Pressable>
        )}
        {history.state !== 'unavailable' ? (
          <>
            <Text style={styles.pendingText}>{history.summary}</Text>
            <Text style={styles.pendingText}>{history.detail}</Text>
          </>
        ) : null}
      </View>

      {/* Story 8.13 finding #6: the "Linha do tempo do ponto selecionado"
          section was sourced from selectedPoint.rows (execution shell
          derived) and rendered "Sem dados suficientes" whenever no test
          had been opened yet. Replaced by the "Leituras anteriores"
          panel below which sources from priorReadings; the legacy
          section is rendered ONLY when no priorReadings exist AND the
          execution shell has rows. */}
      {priorReadings.length === 0 &&
      selectedPoint &&
      selectedPoint.rows.length > 0 ? (
        <>
          <SectionHeader icon="H" title="Linha do tempo do ponto selecionado" />
          {selectedPoint.rows.map((row) => (
            <View key={`${row.label}:${row.value}`} style={styles.historyRowVertical}>
              <View style={styles.historyRowVerticalHeader}>
                <Text style={styles.historyTitle}>{row.label}</Text>
                <StatusPill label={row.stateLabel} severity={row.severity} />
              </View>
              <Text style={styles.historyValueVertical}>{row.value}</Text>
              <Text style={styles.historySubtitle}>{row.stateLabel}</Text>
            </View>
          ))}
        </>
      ) : null}

      {/* Story 8.11 finding #7: multi-point structured history. The panel
          renders prior test readings filtered by the active measurement point
          so the technician can see drift across past tests at a glance. */}
      <SectionHeader icon="P" title="Leituras anteriores neste ponto" />
      {priorReadingsForPoint.length > 0 ? (
        priorReadingsForPoint.map((reading) => (
          <View key={reading.id} style={styles.priorReadingCard}>
            <View style={styles.priorReadingHeader}>
              <Text style={styles.priorReadingDate}>
                {formatPriorReadingDate(reading.observedAt)}
              </Text>
              <StatusPill
                label={formatPriorReadingResultLabel(reading.result)}
                severity={mapPriorReadingResultSeverity(reading.result)}
              />
            </View>
            <Text style={styles.priorReadingValue}>
              {`${formatPriorReadingNumber(reading.observedValue)} ${reading.unit}`}
            </Text>
            <Text style={styles.priorReadingSubtitle}>
              {`Esperado ${formatPriorReadingNumber(reading.expectedValue)} ${reading.unit} - desvio ${formatPriorReadingDeviation(reading)}`}
            </Text>
            {reading.technicianNote ? (
              <Text style={styles.priorReadingNote}>{`Tecnico: ${reading.technicianNote}`}</Text>
            ) : null}
            {reading.supervisorNote ? (
              <Text style={styles.priorReadingNote}>{`Supervisor: ${reading.supervisorNote}`}</Text>
            ) : null}
          </View>
        ))
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>
            {priorReadings.length === 0
              ? 'Sem leituras anteriores armazenadas para esta tag.'
              : 'Sem leituras anteriores no ponto selecionado. Troque o ponto para ver outras medicoes.'}
          </Text>
        </View>
      )}

      <Pressable accessibilityRole="button" onPress={onOpenDiagnosis} style={styles.fullWidthPrimary}>
        <Text style={styles.fullWidthPrimaryIcon}>G</Text>
        <Text style={styles.fullWidthPrimaryLabel}>Abrir orientacao local</Text>
      </Pressable>
      <NavigationAffordanceRow
        onProximo={onOpenDiagnosis}
        proximoLabel="Proximo: Checklist"
      />
    </>
  );
}

function selectPriorReadingsForPoint(
  priorReadings: readonly LocalTagPriorTestReading[],
  selectedPoint: VisualHistoryPointOption | null,
): LocalTagPriorTestReading[] {
  if (priorReadings.length === 0) {
    return [];
  }
  if (!selectedPoint || selectedPoint.pointPercent === null) {
    // The 4-20 mA conversion is unavailable, so the Compare screen falls
    // back to the single "Resultado atual" tab; expose all readings sorted
    // newest-first so the technician can still scan the timeline.
    return [...priorReadings];
  }
  return priorReadings.filter((reading) => reading.pointPercent === selectedPoint.pointPercent);
}

function formatPriorReadingDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatPriorReadingNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/\.?0+$/, '');
}

function formatPriorReadingDeviation(reading: LocalTagPriorTestReading): string {
  const signed = formatPriorReadingNumber(reading.signedDeviation);
  const prefixed = reading.signedDeviation > 0 ? `+${signed}` : signed;
  if (reading.percentOfSpan === null) {
    return `${prefixed} ${reading.unit}`;
  }
  const pct = formatPriorReadingNumber(reading.percentOfSpan);
  const pctPrefixed = reading.percentOfSpan > 0 ? `+${pct}` : pct;
  return `${prefixed} ${reading.unit} (${pctPrefixed}% span)`;
}

function formatPriorReadingResultLabel(
  result: LocalTagPriorTestReading['result'],
): string {
  switch (result) {
    case 'pass':
      return 'OK';
    case 'pass-with-note':
      return 'Observacao';
    case 'fail':
      return 'Falha';
    default:
      return 'OK';
  }
}

// Story 8.15: pick the loop point with the largest absolute error and
// project it as a single-point rawInputs payload (expected/observed
// strings) so the calculation engine can compute a worst-case
// acceptance for the visit aggregator. Returns null when no point has
// usable numeric values yet.
function findWorstLoopCaseRawInputs(
  rows: readonly {
    setpointPercent: number;
    expected: string;
    measured: string;
    expectedPv: number | null;
    expectedMa: number | null;
    measuredPv: number | null;
    measuredMa: number | null;
    error: number | null;
  }[],
  inputMode: 'pv' | 'ma',
): { rawInputs: { expectedValue: string; observedValue: string } } | null {
  let worst: typeof rows[number] | null = null;
  let worstAbs = -Infinity;
  for (const row of rows) {
    if (row.error === null) continue;
    const abs = Math.abs(row.error);
    if (abs > worstAbs) {
      worstAbs = abs;
      worst = row;
    }
  }
  if (!worst) return null;
  const expectedValue =
    inputMode === 'ma'
      ? worst.expectedMa?.toString() ?? worst.expected
      : worst.expectedPv?.toString() ?? worst.expected;
  const observedValue =
    inputMode === 'ma'
      ? worst.measuredMa?.toString() ?? worst.measured
      : worst.measuredPv?.toString() ?? worst.measured;
  return { rawInputs: { expectedValue, observedValue } };
}

// Story 8.14 finding #10: map an evidence-reference's kind to the screen
// where the technician can fix the gap. Structured readings live on the
// calculation screen; observation notes + photos live on the checklist
// (diagnosis) screen. Unknown kinds default to the checklist so the
// technician at least lands on an editable surface.
function resolveEvidenceRefRoute(
  evidenceKind: string,
): VisualReportPendingActionRoute {
  switch (evidenceKind) {
    case 'structured-readings':
      return 'calculation';
    case 'observation-notes':
    case 'photo-evidence':
    case 'unmapped':
    default:
      return 'diagnosis';
  }
}

function visitAcceptanceLabel(
  acceptance: InstrumentVisitView['templates'][number]['acceptance'],
): string {
  switch (acceptance) {
    case 'pass':
      return 'Concluido';
    case 'fail':
      return 'Falha';
    default:
      return 'Em andamento';
  }
}

function visitAcceptanceSeverity(
  acceptance: InstrumentVisitView['templates'][number]['acceptance'],
): VisualSeverity {
  switch (acceptance) {
    case 'pass':
      return 'ok';
    case 'fail':
      return 'high';
    default:
      return 'due';
  }
}

function formatVisitMeasurementLine(
  entry: InstrumentVisitView['templates'][number],
): string {
  const unit = entry.unit ?? '';
  const expected = entry.expectedValueLabel || '-';
  const observed = entry.observedValueLabel || '-';
  const deviation =
    entry.signedDeviation !== null
      ? `${entry.signedDeviation > 0 ? '+' : ''}${entry.signedDeviation.toFixed(3).replace(/\.?0+$/, '')}${unit ? ` ${unit}` : ''}`
      : '-';
  const span =
    entry.percentOfSpan !== null
      ? ` (${entry.percentOfSpan > 0 ? '+' : ''}${entry.percentOfSpan.toFixed(2)}% span)`
      : '';
  return `Esperado ${expected}${unit ? ` ${unit}` : ''} - medido ${observed}${unit ? ` ${unit}` : ''} - desvio ${deviation}${span}`;
}

function resolveTemplateStatusBadge(
  savedStatus: SharedExecutionTemplateStatus | undefined,
  selected: boolean,
): { label: string; severity: VisualSeverity } {
  // Story 8.13 finding #3: badge labels in plain PT-BR so the
  // technician understands the test state at a glance. Order of
  // precedence:
  // 1) saved acceptance pass -> "Concluido" (test is done and passed)
  // 2) saved acceptance fail -> "Incompleto" (test ran but failed; the
  //    technician must redo or justify - same UX treatment as not done)
  // 3) saved without a final acceptance -> "Em andamento" (calc rows
  //    persisted but no pass/fail verdict yet, e.g. partial loop)
  // 4) currently selected, nothing saved -> "Em andamento"
  // 5) untouched -> "Iniciar"
  if (savedStatus) {
    if (savedStatus.acceptance === 'pass') {
      return { label: 'Concluido', severity: 'ok' };
    }
    if (savedStatus.acceptance === 'fail') {
      return { label: 'Incompleto', severity: 'high' };
    }
    return { label: 'Em andamento', severity: 'due' };
  }
  if (selected) {
    return { label: 'Em andamento', severity: 'due' };
  }
  return { label: 'Iniciar', severity: 'medium' };
}

function mapPriorReadingResultSeverity(
  result: LocalTagPriorTestReading['result'],
): VisualSeverity {
  switch (result) {
    case 'pass':
      return 'ok';
    case 'pass-with-note':
      return 'due';
    case 'fail':
      return 'high';
    default:
      return 'medium';
  }
}

function DemoHistoryScreen({
  history,
  selectedTag,
  onBack,
  onOpenDiagnosis,
}: {
  history: VisualHistoryPoint[];
  selectedTag: VisualTagSummary;
  onBack: () => void;
  onOpenDiagnosis: () => void;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.tagHeroTitle}>{selectedTag.code}</Text>
          <Text style={styles.tagHeroSubtitle}>Transmissor de pressao vapor</Text>
        </View>
        <StatusPill label="Falha" severity="high" large />
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Erro atual</Text>
            <Text style={styles.chartValue}>1,45 bar</Text>
          </View>
          <StatusPill label="FALHA" severity="high" />
        </View>
        <View style={styles.chartRail}>
          {history.map((point, index) => (
            <View key={point.label} style={styles.chartPointColumn}>
              <View style={[styles.chartBar, { height: 24 + point.value * 30 }]} />
              <View style={[styles.chartDot, index === history.length - 1 ? styles.chartDotHot : null]} />
              <Text style={styles.chartLabel}>{point.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <SectionHeader icon="◷" title="Historico" />
      {history
        .slice()
        .reverse()
        .map((point) => (
          <View key={point.label} style={styles.historyRow}>
            <View>
              <Text style={styles.historyTitle}>{point.label}</Text>
              <Text style={styles.historySubtitle}>{point.label === 'Hoje' ? 'ha 1 hora' : '...........'}</Text>
            </View>
            <Text style={styles.historyValue}>{formatNumber(point.value)} bar</Text>
            <StatusPill
              label={point.statusLabel}
              severity={point.statusLabel === 'FALHA' ? 'high' : 'due'}
            />
          </View>
        ))}

      <Pressable accessibilityRole="button" onPress={onOpenDiagnosis} style={styles.fullWidthPrimary}>
        <Text style={styles.fullWidthPrimaryIcon}>⌁</Text>
        <Text style={styles.fullWidthPrimaryLabel}>Ver Diagnostico</Text>
      </Pressable>
    </>
  );
}

function ServiceGuidanceScreen({
  guidance,
  stages,
  selectedTag,
  shellMessage,
  // Story 8.10 finding #5: photo thumbnails on the checklist screen so
  // captured photos are visible right where they were taken.
  photoAttachments,
  onAttachExecutionPhoto,
  onBack,
  onChecklistOutcomeChange,
  onObservationNotesChange,
  onOpenStage,
  onOpenReport,
  onRiskJustificationChange,
  onSaveGuidanceEvidence,
}: {
  guidance: VisualExecutionGuidanceViewModel;
  stages: VisualExecutionStage[];
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  photoAttachments: readonly SharedExecutionPhotoAttachment[];
  onAttachExecutionPhoto: (source: 'camera' | 'library', contextNote: string | null) => void;
  onBack: () => void;
  onChecklistOutcomeChange: (
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) => void;
  onObservationNotesChange: (value: string) => void;
  onOpenStage: (route: VisualStageRoute) => void;
  onOpenReport: () => void;
  onRiskJustificationChange: (riskItemId: string, justificationText: string) => void;
  onSaveGuidanceEvidence: () => void;
}) {
  const nextStep =
    guidance.guidedDiagnosisPrompts[0]?.prompt ??
    guidance.checklistItems[0]?.prompt ??
    'Nenhuma proxima orientacao local esta em cache para este teste.';

  if (guidance.state === 'unavailable') {
    return (
      <ExecutionUnavailableScreen
        message={shellMessage}
        onBack={onBack}
        title="Checklist local indisponivel"
        unavailableReason={guidance.unavailableReason}
      />
    );
  }

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <ExecutionStageStepper activeRoute="diagnosis" stages={stages} onOpenStage={onOpenStage} />
      <Text style={styles.tagHeroTitle}>{guidance.tagCode || selectedTag.code}</Text>
      <Text style={styles.tagHeroSubtitle}>{guidance.title}</Text>

      <View style={styles.executionMetricGrid}>
        <ExecutionMetric label="Risco" value={guidance.riskStateLabel} />
        <ExecutionMetric label="Envio" value={guidance.submitReadinessLabel} />
        <ExecutionMetric label="Ultimo salvamento" value={guidance.guidanceEvidenceSavedAtLabel} />
      </View>

      <Text style={styles.kicker}>PROXIMO PASSO</Text>
      <View style={styles.nextStepCard}>
        <Text style={styles.nextStepIcon}>N</Text>
        <Text style={styles.nextStepText}>{nextStep}</Text>
      </View>

      <View style={styles.whyBlock}>
        <Text style={styles.whyTitle}>Resumo da orientacao local</Text>
        <Text style={styles.whyBody}>{guidance.summary}</Text>
        <Text style={styles.whyBody}>{guidance.detail}</Text>
      </View>

      <View style={styles.checklistBlock}>
        <Text style={styles.sectionTitle}>Checklist tecnico</Text>
        {guidance.checklistItems.length > 0 ? (
          guidance.checklistItems.map((item) => (
            <GuidanceChecklistCard
              key={item.id}
              editable={guidance.editable}
              item={item}
              onChecklistOutcomeChange={onChecklistOutcomeChange}
            />
          ))
        ) : (
          <InlineMessage text="Nenhum passo de checklist esta em cache para este teste. Continue com observacoes se necessario." />
        )}
      </View>

      <Text style={styles.sectionTitle}>Observacoes do tecnico</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={guidance.editable}
        multiline
        onChangeText={onObservationNotesChange}
        placeholder="Registre observacoes de campo desta execucao local."
        placeholderTextColor={colors.textSubtle}
        style={[styles.justificationInput, !guidance.editable ? styles.disabledAction : null]}
        value={guidance.observationNotes}
      />

      <Text style={styles.sectionTitle}>Riscos visiveis</Text>
      {guidance.riskItems.length > 0 ? (
        guidance.riskItems.map((item) => (
          <GuidanceRiskCard
            key={item.id}
            editable={guidance.editable}
            item={item}
            onJustificationChange={(value) => onRiskJustificationChange(item.id, value)}
          />
        ))
      ) : (
        <InlineMessage text="Nenhum risco visivel foi marcado pelo historico, contexto, checklist ou evidencias locais." />
      )}

      <Text style={styles.sectionTitle}>Perguntas guiadas</Text>
      {guidance.guidedDiagnosisPrompts.length > 0 ? (
        guidance.guidedDiagnosisPrompts.map((item) => (
          <GuidancePromptView key={item.id} item={item} title="Pergunta deterministica" />
        ))
      ) : (
        <InlineMessage text="Nenhuma pergunta de diagnostico guiado esta em cache para este teste." />
      )}

      <Text style={styles.sectionTitle}>Boas praticas e referencias</Text>
      {guidance.linkedGuidance.length > 0 ? (
        guidance.linkedGuidance.map((item) => (
          <LinkedGuidanceView key={item.id} item={item} />
        ))
      ) : (
        <InlineMessage text="Nenhuma boa pratica ou referencia normativa esta em cache para esta tag." />
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!guidance.editable}
        onPress={onSaveGuidanceEvidence}
        style={[styles.fullWidthPrimary, !guidance.editable ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Salvar checklist e observacoes</Text>
      </Pressable>

      <ExecutionPhotoActions
        contextNote="Checklist"
        editable={guidance.editable}
        label="Adicione foto do equipamento, da medicao ou do contexto local do checklist."
        onAttach={onAttachExecutionPhoto}
        photos={photoAttachments}
        filterStepKind="guidance"
      />

      <Pressable accessibilityRole="button" onPress={onOpenReport} style={styles.secondaryFullWidth}>
        <Text style={styles.returnLabel}>Continuar para relatorio</Text>
      </Pressable>
      <NavigationAffordanceRow
        onProximo={onOpenReport}
        proximoLabel="Proximo: Relatorio"
      />
    </>
  );
}

function DemoDiagnosisScreen({
  diagnosis,
  onBack,
  onOpenReport,
  onSelectSymptom,
}: {
  diagnosis: ReturnType<typeof buildTechnicianVisualWorkflow>['diagnosis'];
  onBack: () => void;
  onOpenReport: () => void;
  onSelectSymptom: (symptom: string) => void;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.screenTitle}>Diagnostico</Text>

      <View style={styles.diagnosisCard}>
        <Text style={styles.formLabel}>Sintoma</Text>
        {diagnosis.symptoms.map((symptom) => {
          const selected = diagnosis.selectedSymptom === symptom;
          return (
            <Pressable
              key={symptom}
              accessibilityRole="button"
              onPress={() => onSelectSymptom(symptom)}
              style={[styles.symptomRow, selected ? styles.symptomRowSelected : null]}
            >
              <Text style={[styles.symptomText, selected ? styles.symptomTextSelected : null]}>
                {symptom}
              </Text>
              {selected ? <Text style={styles.checkmark}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.kicker}>HIPOTESE PROVAVEL</Text>
      <Pressable accessibilityRole="button" style={styles.hypothesisCard}>
        <Text style={styles.hypothesisIcon}>?</Text>
        <Text style={styles.hypothesisText}>{diagnosis.hypothesis}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Text style={styles.kicker}>PROXIMO PASSO</Text>
      <View style={styles.nextStepCard}>
        <Text style={styles.nextStepIcon}>⚒</Text>
        <Text style={styles.nextStepText}>{diagnosis.nextStep}</Text>
      </View>

      <View style={styles.whyBlock}>
        <Text style={styles.whyTitle}>+  Por que isso?</Text>
        <Text style={styles.whyBody}>{diagnosis.why}</Text>
      </View>

      <View style={styles.checklistBlock}>
        <Text style={styles.sectionTitle}>Checklist Tecnico</Text>
        {diagnosis.checklist.map((item) => (
          <View key={item} style={styles.checklistRow}>
            <Text style={styles.checklistBox}>✓</Text>
            <Text style={styles.checklistText}>{item}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenReport} style={styles.fullWidthPrimary}>
        <Text style={styles.fullWidthPrimaryLabel}>Gerar Relatorio</Text>
      </Pressable>
    </>
  );
}

function ServiceReportScreen({
  report,
  stages,
  shellMessage,
  syncBusy,
  instrumentVisit,
  onAttachCamera,
  onAttachLibrary,
  onBack,
  onNavigatePending,
  onOpenStage,
  onRefreshServerStatus,
  onRemovePhoto,
  onRetrySync,
  onReviewNotesChange,
  onSaveDraft,
  onSubmitReport,
  onUpdatePhotoTechnicianNote,
  onRequestExecutionAiDiagnosis,
  onStartNewVisit,
  appLanguage,
}: {
  report: VisualReportProjection;
  stages: VisualExecutionStage[];
  shellMessage: string | null;
  syncBusy: boolean;
  // Story 8.11 finding #10: per-visit aggregate rendered above the
  // per-template report so the technician sees a single Relatorio
  // listing all tests run on the tag.
  instrumentVisit: InstrumentVisitView | null;
  onAttachCamera: () => void;
  onAttachLibrary: () => void;
  onBack: () => void;
  onNavigatePending: (route: VisualReportPendingActionRoute) => void;
  onOpenStage: (route: VisualStageRoute) => void;
  onRefreshServerStatus: () => void;
  onRemovePhoto: (evidenceId: string) => void;
  onRetrySync: () => void;
  onReviewNotesChange: (value: string) => void;
  onSaveDraft: () => void;
  onSubmitReport: () => void;
  onUpdatePhotoTechnicianNote: (evidenceId: string, note: string | null) => void;
  // Story 8.9 D-01: technician manual AI request handler.
  onRequestExecutionAiDiagnosis: () => void;
  // Handler to start a new visit after a report is invalidated/returned.
  onStartNewVisit?: () => void;
  appLanguage?: AppLanguage;
}) {
  if (report.state !== 'available') {
    return (
      <ExecutionUnavailableScreen
        message={shellMessage}
        title="Relatorio indisponivel"
        unavailableReason={report.unavailableReason}
        onBack={onBack}
      />
    );
  }

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <ExecutionStageStepper activeRoute="report" stages={stages} onOpenStage={onOpenStage} />
      <Text style={styles.screenTitle}>Relatorio</Text>

      {/* Story 8.12 finding #2: a supervisor-returned report is marked
          INVALIDATED and the technician must start a new visit. The
          banner is bold + red so it cannot be missed; the supervisor's
          return comment is rendered inline so the technician knows what
          to correct in the new visit. */}
      {report.invalidated ? (
        <View style={styles.invalidatedBanner}>
          <Text style={styles.invalidatedBannerTitle}>
            Relatorio invalidado pelo supervisor
          </Text>
          <Text style={styles.invalidatedBannerBody}>
            Este relatorio foi devolvido. Ele permanece visivel como historico
            mas nao pode ser editado nem reenviado. Inicie uma nova visita ao
            instrumento para registrar as correcoes.
          </Text>
          {report.invalidationReason ? (
            <Text style={styles.invalidatedBannerReason}>
              {`Motivo do supervisor: ${report.invalidationReason}`}
            </Text>
          ) : null}
        </View>
      ) : null}
      {report.invalidated && onStartNewVisit ? (
        <Pressable
          onPress={() => onStartNewVisit()}
          style={{
            backgroundColor: '#2563eb',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 20,
            marginTop: 16,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>
            {appLanguage === 'en' ? '+ Start New Visit' : '+ Iniciar Nova Visita'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.summaryCard}>
        {/* Story 8.8 D-05: technician report header rendered vertically so the
            Sync row's compound "label: detail" string and long template
            titles stay readable on narrow Android phones. */}
        <SummaryLine label="Tag" value={report.tagCode} variant="vertical" />
        <SummaryLine label="Template" value={report.templateTitle} variant="vertical" />
        <SummaryLine
          label="Ciclo"
          value={reviewLifecycleLabel(report.lifecycleStateLabel)}
          pill
          variant="vertical"
        />
        <SummaryLine label="Estado" value={report.reportStateLabel} variant="vertical" />
        <SummaryLine
          label="Sync"
          value={`${syncLabel(report.syncBadge.state)}: ${report.syncBadge.detail}`}
          variant="vertical"
        />
      </View>

      {/* Story 8.11 finding #10: per-visit aggregate panel rendered as
          ONE relatorio. Each test the technician ran on this tag shows
          up here with its acceptance and key measurement, regardless of
          which per-template shell is currently active. */}
      {instrumentVisit && instrumentVisit.templates.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Resumo da visita</Text>
          <View style={styles.summaryCard}>
            <SummaryLine
              label="Testes executados"
              value={`${instrumentVisit.templates.length} de ${instrumentVisit.templates.length}`}
              variant="vertical"
            />
            {instrumentVisit.templates.map((entry) => (
              <View key={entry.templateId} style={styles.visitTemplateRow}>
                <View style={styles.visitTemplateHeader}>
                  <Text style={styles.visitTemplateTitle}>
                    {toPtBrTemplateLabel(entry.templateTitle)}
                  </Text>
                  <StatusPill
                    label={visitAcceptanceLabel(entry.acceptance)}
                    severity={visitAcceptanceSeverity(entry.acceptance)}
                  />
                </View>
                <Text style={styles.visitTemplateLine}>
                  {formatVisitMeasurementLine(entry)}
                </Text>
                {entry.acceptanceReason ? (
                  <Text style={styles.visitTemplateNote}>{entry.acceptanceReason}</Text>
                ) : null}
                {/* Story 8.15: persisted loop curve. Each row is one
                    setpoint with the expected / measured / error per
                    the technician's input mode (PV or mA). The
                    severity pill is hot for points that exceeded
                    tolerance. */}
                {entry.loopReadings.length > 0 ? (
                  <View style={styles.loopResultTable}>
                    <Text style={styles.visitTemplateNote}>
                      {`Curva do teste de loop (${entry.loopInputMode === 'ma' ? 'modo mA' : 'modo PV'}):`}
                    </Text>
                    {entry.loopReadings.map((reading) => (
                      <View key={`${entry.templateId}-${reading.setpointPercent}`} style={styles.loopResultRow}>
                        <Text style={styles.loopResultPercent}>{`${reading.setpointPercent}%`}</Text>
                        <Text style={styles.loopResultValue}>
                          {`esp ${reading.expected || '-'} / med ${reading.measured || '-'}`}
                        </Text>
                        <StatusPill
                          label={
                            reading.passed === null
                              ? 'pendente'
                              : reading.passed
                              ? 'OK'
                              : 'fora'
                          }
                          severity={
                            reading.passed === null
                              ? 'medium'
                              : reading.passed
                              ? 'ok'
                              : 'high'
                          }
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Resumo automatico</Text>
      <View style={styles.summaryCard}>
        {report.summaryRows.map((row) => (
          <ReportSummaryBlock key={row.label} label={row.label} value={row.value} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Pendencias e acoes</Text>
      {report.pendingActions.length > 0 ? (
        report.pendingActions.map((action) => (
          <Pressable
            accessibilityRole="button"
            key={action.id}
            onPress={() => onNavigatePending(action.route)}
            style={[
              styles.pendingActionCard,
              action.blocking ? styles.guidanceCardWarning : null,
            ]}
          >
            <View style={styles.loopPointHeader}>
              <Text style={styles.historyTitle}>{action.label}</Text>
              <StatusPill
                label={action.blocking ? 'Bloqueia envio' : 'Justificar'}
                severity={action.blocking ? 'high' : 'medium'}
              />
            </View>
            <Text style={styles.pendingText}>{action.detail}</Text>
            <Text style={styles.smallGhostLabel}>Abrir etapa para resolver</Text>
          </Pressable>
        ))
      ) : (
        <InlineMessage text="Nenhuma pendencia critica local foi projetada para este relatorio." />
      )}

      <Text style={styles.sectionTitle}>Resultado do checklist</Text>
      {report.checklistOutcomes.length > 0 ? (
        report.checklistOutcomes.map((item) => (
          <View key={item.id} style={styles.historyRow}>
            <Text style={styles.checklistBox}>{checklistOutcomeSymbol(item.outcome)}</Text>
            <View style={styles.flexOne}>
              <Text style={styles.historyTitle}>{item.prompt}</Text>
              <Text style={styles.historySubtitle}>
                {toChecklistOutcomeLabel(item.outcome)} - {item.sourceReference}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            Nenhum resultado de checklist foi capturado neste rascunho local ainda.
          </Text>
        </View>
      )}

      <SectionHeader
        actionLabel={`${report.photoAttachments.length} fotos locais`}
        title="Evidencias"
      />
      {/* Story 8.14 finding #9: the report page is now read-only - it
          is for double-checking, not for adding evidence. Photos are
          captured from the instrument detail screen, the test
          execution screens, and the checklist screen. The hint here
          tells the technician where to add new evidence; tapping a
          missing-evidence card below also routes there. */}
      <View style={styles.nextActionPanel}>
        <Text style={styles.pendingTitle}>Fotos e anexos</Text>
        <Text style={styles.pendingText}>
          As fotos sao adicionadas durante a execucao do teste, no checklist ou na
          tela do instrumento. Esta tela mostra apenas o que ja foi capturado para
          revisao antes do envio.
        </Text>
      </View>

      {/* Story 8.14 finding #10: unsatisfied evidence references are
          now interactive - tapping routes the technician to the screen
          where they can fix the gap. Submission is never blocked. */}
      {report.evidenceReferences.map((reference) => {
        const targetRoute = resolveEvidenceRefRoute(reference.evidenceKind);
        const unsatisfied = !reference.satisfied;
        const flagged = unsatisfied && reference.requirementLevel === 'minimum';
        return (
          <Pressable
            accessibilityRole="button"
            key={`${reference.evidenceKind}:${reference.label}`}
            onPress={() => (unsatisfied ? onNavigatePending(targetRoute) : undefined)}
            style={[styles.guidanceCard, flagged ? styles.guidanceCardWarning : null]}
          >
            <Text style={styles.historyTitle}>{reference.label}</Text>
            <Text style={styles.pendingText}>
              {reference.requirementLevel.toUpperCase()} - {reference.stateLabel}
            </Text>
            <Text style={styles.pendingText}>{reference.detail}</Text>
            {unsatisfied ? (
              <Text style={styles.smallGhostLabel}>Abrir etapa para resolver</Text>
            ) : null}
          </Pressable>
        );
      })}

      {report.photoAttachments.length > 0 ? (
        <View style={styles.reportPhotoGrid}>
          {report.photoAttachments.map((attachment) => (
            // Story 8.14 finding #9: photo cards on the Report screen
            // are read-only. Remove + technician-note editing happen
            // on the checklist screen where the photo was captured.
            <ReportPhotoCard
              key={attachment.evidenceId}
              attachment={attachment}
              editable={false}
              onRemove={() => onRemovePhoto(attachment.evidenceId)}
              onUpdateTechnicianNote={(note) =>
                onUpdatePhotoTechnicianNote(attachment.evidenceId, note)
              }
            />
          ))}
        </View>
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            Nenhuma foto foi anexada localmente a este relatorio ainda.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Riscos e justificativas</Text>
      {/* Story 8.14 finding #10: risk items now route the technician
          to the checklist screen where the justification editor lives.
          Submission is never blocked. */}
      {report.riskFlags.length > 0 ? (
        report.riskFlags.map((riskFlag) => (
          <Pressable
            accessibilityRole="button"
            key={riskFlag.id}
            onPress={() => onNavigatePending('diagnosis')}
            style={[
              styles.guidanceCard,
              riskFlag.severity === 'submit-block' ? styles.guidanceCardWarning : null,
            ]}
          >
            <Text style={styles.historyTitle}>{riskFlag.title}</Text>
            <Text style={styles.pendingText}>{riskFlag.stateLabel}</Text>
            <Text style={styles.pendingText}>{riskFlag.detail}</Text>
            <Text style={styles.pendingText}>
              Justificativa: {riskFlag.justificationText.trim() || 'Nao capturada'}
            </Text>
            <Text style={styles.smallGhostLabel}>Abrir checklist para justificar</Text>
          </Pressable>
        ))
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>Nenhum risco local esta ativo neste relatorio.</Text>
        </View>
      )}

      {/* Story 8.14 finding #9: the report page is read-only. The
          technician's review notes were the ONE thing the report page
          let the user edit, and the user wanted them moved entirely to
          the checklist screen (where "Observacoes do tecnico" already
          lives). This block now shows the captured notes for review;
          edits happen at the source. */}
      <Text style={styles.sectionTitle}>Observacoes do tecnico</Text>
      {report.invalidated && report.editLockReason ? (
        <InlineMessage text={report.editLockReason} />
      ) : null}
      <View style={styles.pendingCard}>
        {report.reviewNotes.trim().length > 0 ? (
          <Text style={styles.pendingText}>{report.reviewNotes}</Text>
        ) : (
          <Text style={styles.pendingText}>
            Nenhuma observacao adicional foi capturada no checklist. Para
            adicionar uma nota, abra o checklist tecnico.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => onNavigatePending('diagnosis')}
          style={styles.smallGhostButton}
        >
          <Text style={styles.smallGhostLabel}>Abrir checklist para editar</Text>
        </Pressable>
      </View>

      <View style={styles.guidanceCard}>
        <Text style={styles.historySubtitle}>Inteligencia do relatorio</Text>
        <Text style={styles.historyTitle}>Diagnostico de IA</Text>
        <Text style={styles.pendingText}>{report.aiDiagnosis.label}</Text>
        <Text style={styles.pendingText}>{report.aiDiagnosis.detail}</Text>
        {report.aiDiagnosis.summary ? (
          <Text style={styles.pendingText}>{report.aiDiagnosis.summary}</Text>
        ) : null}
        {report.aiDiagnosis.generatedAtLabel ? (
          <Text style={styles.historySubtitle}>
            Gerado em: {report.aiDiagnosis.generatedAtLabel}
          </Text>
        ) : null}
        {/* Story 8.9 D-01: manual AI request button. Visible when the state
            is not 'available' (no prior result yet, or a prior result was
            replaced/failed). Tap enqueues a worker job server-side and
            refreshes the local AI projection. AI is assistive — disabled
            state surfaces a hint but does NOT block report submission.
            Story 11.6 (issue #5): the AI diagnosis service is keyed on the
            server-side `report_submission_records` row, which only exists
            AFTER the technician submits the report. While the report is
            still a 'technician-owned-draft', the request returns 404
            "Report submission was not found for this technician". Hide
            the button in that state and surface a clear hint so the
            technician understands the order of operations. */}
        {report.reportSubmissionState === 'technician-owned-draft' ? (
          <Text style={styles.pendingText}>
            Envie o relatorio primeiro para solicitar diagnostico assistido.
          </Text>
        ) : report.aiDiagnosis.state !== 'available' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void onRequestExecutionAiDiagnosis()}
            style={[styles.smallActionButton, styles.reportInlineButton]}
          >
            <Text style={styles.smallActionLabel}>
              {report.aiDiagnosis.state === 'pending'
                ? 'Aguardando diagnostico (toque para reverificar)'
                : 'Solicitar diagnostico assistido'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Sincronizacao</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>{syncLabel(report.syncBadge.state)}</Text>
        {/* Story 8.7 AC 12: when the badge state is sync-issue, surface a clear
            PT-BR classification line above the raw detail rows so the user
            understands whether the failure is offline, session-expired,
            backend-degraded, or unknown. */}
        {report.syncBadge.state === 'sync-issue' ? (
          <Text style={styles.pendingText}>
            {classifySyncError({ errorMessage: report.syncBadge.detail }).copy}
          </Text>
        ) : null}
        {report.syncDetailRows.map((row) => (
          <Text key={row.label} style={styles.pendingText}>
            {row.label}: {row.value}
          </Text>
        ))}
      </View>
      <View style={styles.reportActionGrid}>
        <Pressable
          accessibilityRole="button"
          disabled={!report.canRetrySync || syncBusy}
          onPress={onRetrySync}
          style={[
            styles.smallActionButton,
            !report.canRetrySync || syncBusy ? styles.disabledAction : null,
          ]}
        >
          <Text style={styles.smallActionLabel}>Tentar sync</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!report.canRefreshServerStatus || syncBusy}
          onPress={onRefreshServerStatus}
          style={[
            styles.smallGhostButton,
            !report.canRefreshServerStatus || syncBusy ? styles.disabledAction : null,
          ]}
        >
          <Text style={styles.smallGhostLabel}>Atualizar status</Text>
        </Pressable>
      </View>

      {/* Story 8.14 finding #9: "Salvar rascunho" removed - the
          report page is read-only review, and the per-step screens
          already persist their work. The only action on this page is
          "Enviar relatorio" plus the AI request button above. Per
          finding #10 the submit is never blocked, even with missing
          inputs - tap a red flag to fix what's missing first, or
          submit as-is. */}
      <Pressable
        accessibilityRole="button"
        disabled={!report.canSubmit}
        onPress={onSubmitReport}
        style={[styles.fullWidthPrimary, !report.canSubmit ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Enviar relatorio</Text>
      </Pressable>
      {!report.canSubmit && report.invalidated ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Envio bloqueado</Text>
          <Text style={styles.pendingText}>{report.submitReadinessLabel}</Text>
        </View>
      ) : null}
      <NavigationAffordanceRow />
    </>
  );
}

function ServiceReviewScreen({
  access,
  activeGroupKey,
  busy,
  detail,
  escalationRationale,
  groups,
  pendingDecision,
  returnComment,
  shellMessage,
  onApprove,
  onBack,
  onCancelDecision,
  onCloseReport,
  onConfirmDecision,
  onEscalate,
  onEscalationRationaleChange,
  onGroupChange,
  onOpenReport,
  onRefresh,
  onReturn,
  onReturnCommentChange,
}: {
  access: ReturnType<typeof buildVisualReviewAccess>;
  activeGroupKey: VisualReviewQueueGroupKey;
  busy: boolean;
  detail: VisualReviewDetailProjection;
  escalationRationale: string;
  groups: VisualReviewQueueGroup[];
  pendingDecision: VisualReviewDecisionRequest | null;
  returnComment: string;
  shellMessage: string | null;
  onApprove: () => void;
  onBack: () => void;
  onCancelDecision: () => void;
  onCloseReport: () => void;
  onConfirmDecision: () => void;
  onEscalate: () => void;
  onEscalationRationaleChange: (value: string) => void;
  onGroupChange: (groupKey: VisualReviewQueueGroupKey) => void;
  onOpenReport: (reportId: string) => void;
  onRefresh: () => void;
  onReturn: () => void;
  onReturnCommentChange: (value: string) => void;
}) {
  const activeGroup =
    groups.find((group) => group.key === activeGroupKey) ?? groups[0];

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <Text style={styles.screenTitle}>Revisao</Text>

      <View style={styles.summaryCard}>
        <SummaryLine label="Acesso" value={access.label} pill={access.state === 'available'} />
        <SummaryLine label="Perfil" value={access.reviewerRole ?? 'Nenhum'} />
        <SummaryLine label="Estado" value={reviewAccessStateLabel(access.state)} />
        <SummaryLine label="Autoridade" value={access.canUseDecisionActions ? 'Conectado' : 'Indisponivel'} />
      </View>

      {access.state !== 'available' ? (
        <View style={styles.connectionCard}>
          <Text style={styles.connectionTitle}>{access.label}</Text>
          <Text style={styles.connectionBody}>{access.detail}</Text>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={busy || !access.canLoadQueue}
            onPress={onRefresh}
            style={[
              styles.fullWidthPrimary,
              busy || !access.canLoadQueue ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.fullWidthPrimaryLabel}>
              {busy ? 'Carregando fila...' : 'Atualizar fila'}
            </Text>
          </Pressable>

          <ScrollView
            contentContainerStyle={styles.chipRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {groups.map((group) => (
              <FilterChip
                active={group.key === activeGroup.key}
                count={group.count}
                key={group.key}
                label={group.label}
                onPress={() => onGroupChange(group.key)}
              />
            ))}
          </ScrollView>

          <SectionHeader title={`Fila: ${activeGroup.label}`} />
          {activeGroup.items.length === 0 ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingText}>{activeGroup.emptyLabel}</Text>
            </View>
          ) : (
            activeGroup.items.map((item) => (
              <View key={item.reportId} style={styles.guidanceCard}>
                <Text style={styles.historyTitle}>{item.tagId}</Text>
                <Text style={styles.historySubtitle}>{item.reportId}</Text>
                {/* Story 8.8 D-05: supervisor queue card uses vertical layout
                    so long work-package IDs (e.g. "BP-2025-001-A") do not
                    truncate. */}
                <SummaryLine
                  label="Ciclo"
                  value={reviewLifecycleLabel(item.statusLabel)}
                  variant="vertical"
                />
                <SummaryLine label="Pacote" value={item.workPackageId} variant="vertical" />
                <SummaryLine label="Riscos" value={`${item.riskFlagCount}`} variant="vertical" />
                <SummaryLine
                  label="Evidencias pendentes"
                  value={`${item.pendingEvidenceCount}`}
                  variant="vertical"
                />
                <Text style={styles.pendingText}>{item.executionSummary}</Text>
                <Text style={styles.pendingText}>Aceito em: {item.acceptedAtLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onOpenReport(item.reportId)}
                  style={[styles.smallActionButton, busy ? styles.disabledAction : null]}
                >
                  <Text style={styles.smallActionLabel}>Abrir detalhe</Text>
                </Pressable>
              </View>
            ))
          )}

          {detail.state === 'available' ? (
            <ReviewDetailView
              busy={busy}
              detail={detail}
              escalationRationale={escalationRationale}
              pendingDecision={pendingDecision}
              returnComment={returnComment}
              onApprove={onApprove}
              onCancelDecision={onCancelDecision}
              onCloseReport={onCloseReport}
              onConfirmDecision={onConfirmDecision}
              onEscalate={onEscalate}
              onEscalationRationaleChange={onEscalationRationaleChange}
              onReturn={onReturn}
              onReturnCommentChange={onReturnCommentChange}
            />
          ) : null}
        </>
      )}
    </>
  );
}

function ReviewDetailView({
  busy,
  detail,
  escalationRationale,
  pendingDecision,
  returnComment,
  onApprove,
  onCancelDecision,
  onCloseReport,
  onConfirmDecision,
  onEscalate,
  onEscalationRationaleChange,
  onReturn,
  onReturnCommentChange,
}: {
  busy: boolean;
  detail: VisualReviewDetailProjection;
  escalationRationale: string;
  pendingDecision: VisualReviewDecisionRequest | null;
  returnComment: string;
  onApprove: () => void;
  onCancelDecision: () => void;
  onCloseReport: () => void;
  onConfirmDecision: () => void;
  onEscalate: () => void;
  onEscalationRationaleChange: (value: string) => void;
  onReturn: () => void;
  onReturnCommentChange: (value: string) => void;
}) {
  const returnReady = returnComment.trim().length > 0;
  const escalationReady = escalationRationale.trim().length > 0;

  return (
    <View style={styles.guidanceCard}>
      <Text style={styles.sectionTitle}>{detail.title}</Text>
      <View style={styles.summaryCard}>
        {/* Story 8.8 D-05: supervisor review detail block uses vertical layout
            so long timestamps and reviewer names in dynamic summaryRows do
            not wrap. */}
        <SummaryLine
          label="Ciclo"
          value={reviewLifecycleLabel(detail.lifecycleStateLabel)}
          pill
          variant="vertical"
        />
        <SummaryLine label="Sync" value={syncLabel(detail.syncStateLabel)} variant="vertical" />
        {detail.summaryRows.map((row) => (
          <SummaryLine key={row.label} label={row.label} value={row.value} variant="vertical" />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Estado das evidencias</Text>
      <View style={styles.pendingCard}>
        {detail.evidenceStatusRows.map((row) => (
          <Text key={row.label} style={styles.pendingText}>
            {row.label}: {row.value}
          </Text>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Referencias de evidencia</Text>
      {detail.evidenceReferences.length > 0 ? (
        detail.evidenceReferences.map((reference) => (
          <View
            key={`${reference.requirementLevel}:${reference.label}`}
            style={[
              styles.guidanceCard,
              !reference.satisfied && reference.requirementLevel === 'minimum'
                ? styles.guidanceCardWarning
                : null,
            ]}
          >
            <Text style={styles.historyTitle}>{reference.label}</Text>
            <Text style={styles.pendingText}>
              {requirementLevelLabel(reference.requirementLevel)} - {reference.stateLabel}
            </Text>
            <Text style={styles.pendingText}>{reference.detail}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>O servico nao retornou referencias de evidencia.</Text>
      )}

      <Text style={styles.sectionTitle}>Fotos</Text>
      {detail.photoAttachments.length > 0 ? (
        detail.photoAttachments.map((photo) => (
          <View key={photo.evidenceId} style={styles.pendingCard}>
            {/* Story 8.8 D-02: contextSubtitle carries the sub-step label
                (Instrumento / Calculo / Checklist / Ponto de loop X%) so the
                supervisor knows where each photo was captured. Falls back to
                "Sem etapa" for pre-8.8 photos. */}
            <Text style={styles.pendingTitle}>{photo.contextSubtitle}</Text>
            {/* Story 10.2 (issue #4): render the actual photo image via the
                pre-signed downloadUrl that the supervisor review service
                fetched at detail-load time. Falls back to the metadata card
                when finalization is not complete or the access auth call
                failed. */}
            {photo.downloadUrl ? (
              <Image
                source={{ uri: photo.downloadUrl }}
                style={styles.supervisorPhotoImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.pendingText}>
                {photo.presenceFinalizedAt
                  ? 'Imagem indisponivel no momento. Verifique a conexao e reabra o detalhe.'
                  : 'Foto ainda nao finalizada no servidor.'}
              </Text>
            )}
            <Text style={styles.pendingText}>Finalizada: {photo.finalizedLabel}</Text>
            {/* Story 8.8 D-04: surface the technician's free-text observation
                directly on the supervisor's photo card. Empty when none was
                captured. */}
            {photo.technicianNoteLabel.length > 0 ? (
              <Text style={styles.pendingText}>
                Observacao do tecnico: {photo.technicianNoteLabel}
              </Text>
            ) : (
              <Text style={styles.pendingText}>Sem observacao do tecnico.</Text>
            )}
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>Nenhuma foto esta vinculada a este detalhe de revisao.</Text>
      )}

      <Text style={styles.sectionTitle}>Riscos e justificativas</Text>
      {detail.riskFlags.length > 0 ? (
        detail.riskFlags.map((risk) => (
          <View key={risk.id} style={styles.guidanceCard}>
            <Text style={styles.historyTitle}>{risk.reasonType}</Text>
            <Text style={styles.pendingText}>{risk.stateLabel}</Text>
            <Text style={styles.pendingText}>Justificativa: {risk.justificationLabel}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>O servico nao retornou riscos.</Text>
      )}

      <Text style={styles.sectionTitle}>Diagnostico de IA</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>{detail.aiDiagnosis.label}</Text>
        <Text style={styles.pendingText}>{detail.aiDiagnosis.detail}</Text>
        {detail.aiDiagnosis.summary ? (
          <Text style={styles.pendingText}>{detail.aiDiagnosis.summary}</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Historico de auditoria</Text>
      {detail.approvalHistory.items.length > 0 ? (
        detail.approvalHistory.items.map((item) => (
          <View key={item.auditEventId} style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>{item.actionType}</Text>
            <Text style={styles.pendingText}>Perfil: {item.actorRole}</Text>
            <Text style={styles.pendingText}>Quando: {item.occurredAtLabel}</Text>
            <Text style={styles.pendingText}>Estado: {item.stateTransitionLabel}</Text>
            <Text style={styles.pendingText}>Correlacao: {item.correlationId}</Text>
            {item.comment ? <Text style={styles.pendingText}>Comentario: {item.comment}</Text> : null}
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>{detail.approvalHistory.placeholder}</Text>
      )}

      <Text style={styles.sectionTitle}>Comentario da decisao</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={detail.canReturn && !busy}
        multiline
        onChangeText={onReturnCommentChange}
        placeholder="Comentario obrigatorio para devolucao"
        placeholderTextColor={colors.textSubtle}
        style={[styles.justificationInput, !detail.canReturn || busy ? styles.disabledAction : null]}
        value={returnComment}
      />
      {detail.canEscalate ? (
        <>
          <Text style={styles.sectionTitle}>Justificativa do escalonamento</Text>
          <TextInput
            autoCapitalize="sentences"
            autoCorrect
            editable={detail.canEscalate && !busy}
            multiline
            onChangeText={onEscalationRationaleChange}
            placeholder="Justificativa obrigatoria para escalonar"
            placeholderTextColor={colors.textSubtle}
            style={[
              styles.justificationInput,
              !detail.canEscalate || busy ? styles.disabledAction : null,
            ]}
            value={escalationRationale}
          />
        </>
      ) : null}

      {pendingDecision ? (
        <View
          style={[
            styles.pendingCard,
            pendingDecision.state === 'blocked' ? styles.guidanceCardWarning : null,
          ]}
        >
          <Text style={styles.pendingTitle}>
            {pendingDecision.state === 'requires-confirmation'
              ? pendingDecision.title
              : 'Decisao bloqueada'}
          </Text>
          <Text style={styles.pendingText}>{pendingDecision.message}</Text>
          {pendingDecision.state === 'requires-confirmation' ? (
            <View style={styles.reportActionGrid}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onConfirmDecision}
                style={[styles.smallActionButton, busy ? styles.disabledAction : null]}
              >
                <Text style={styles.smallActionLabel}>{pendingDecision.confirmLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onCancelDecision}
                style={styles.smallGhostButton}
              >
                <Text style={styles.smallGhostLabel}>Cancelar</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onCancelDecision}
              style={styles.smallGhostButton}
            >
              <Text style={styles.smallGhostLabel}>Fechar</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={styles.reportActionGrid}>
        <Pressable
          accessibilityRole="button"
          disabled={!detail.canApprove || busy}
          onPress={onApprove}
          style={[styles.smallActionButton, !detail.canApprove || busy ? styles.disabledAction : null]}
        >
          <Text style={styles.smallActionLabel}>Aprovar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!detail.canReturn || busy || !returnReady}
          onPress={onReturn}
          style={[
            styles.smallGhostButton,
            !detail.canReturn || busy || !returnReady ? styles.disabledAction : null,
          ]}
        >
          <Text style={styles.smallGhostLabel}>Devolver</Text>
        </Pressable>
        {detail.canEscalate ? (
          <Pressable
            accessibilityRole="button"
            disabled={!detail.canEscalate || busy || !escalationReady}
            onPress={onEscalate}
            style={[
              styles.smallGhostButton,
              !detail.canEscalate || busy || !escalationReady ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.smallGhostLabel}>Escalar</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onCloseReport} style={styles.secondaryFullWidth}>
        <Text style={styles.returnLabel}>Voltar para fila</Text>
      </Pressable>
    </View>
  );
}

function DemoReportScreen({
  justification,
  report,
  onBack,
  onJustificationChange,
  onOpenApproval,
}: {
  justification: string;
  report: ReturnType<typeof buildTechnicianVisualWorkflow>['report'];
  onBack: () => void;
  onJustificationChange: (value: string) => void;
  onOpenApproval: () => void;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.screenTitle}>Relatorio</Text>

      <Text style={styles.sectionTitle}>Resumo Automatico</Text>
      <View style={styles.summaryCard}>
        <SummaryLine label="Tag" value={report.tagCode} />
        <SummaryLine label="Sintoma" value={report.symptom} pill />
        <SummaryLine
          label="Ultimo valor"
          value={`${report.lastValueLabel} (esperado: ${report.expectedValueLabel})`}
        />
        <SummaryLine label="Erro" value={report.errorLabel} danger />
        <SummaryLine label="Diagnostico" value={report.diagnosis} />
        <SummaryLine label="Acao executada" value={report.action} />
        <SummaryLine label="Pendencias" value={report.pending} />
      </View>

      <SectionHeader actionLabel="3 fotos" title="Anexos" />
      <View style={styles.attachmentRow}>
        {report.attachments.map((attachment, index) => (
          <View key={attachment} style={styles.attachmentThumb}>
            <Text style={styles.attachmentIcon}>▧</Text>
            <Text style={styles.attachmentLabel}>Foto {index + 1}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Pendencias</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>!  Nenhuma</Text>
        <Text style={styles.pendingText}>□ Registro do selo mecanico estara disponivel na proxima calibracao.</Text>
        <Text style={styles.pendingText}>□ Teste de valvula foi adiado por falta de material.</Text>
      </View>

      <Text style={styles.sectionTitle}>Justificativa</Text>
      <TextInput
        multiline
        onChangeText={onJustificationChange}
        placeholder="Explique brevemente o motivo da pendencia..."
        placeholderTextColor={colors.textSubtle}
        style={styles.justificationInput}
        value={justification}
      />

      <Pressable accessibilityRole="button" onPress={onOpenApproval} style={styles.fullWidthPrimary}>
        <Text style={styles.fullWidthPrimaryLabel}>Enviar para Aprovacao</Text>
      </Pressable>
    </>
  );
}

function ApprovalScreen({
  justification,
  report,
  onApprove,
  onBack,
  onReturn,
}: {
  justification: string;
  report: ReturnType<typeof buildTechnicianVisualWorkflow>['report'];
  onApprove: () => void;
  onBack: () => void;
  onReturn: () => void;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <Text style={styles.screenTitle}>Aprovacao</Text>

      <View style={styles.summaryCard}>
        <SummaryLine label="Tag" value={report.tagCode} />
        <SummaryLine label="Sintoma" value={report.symptom} pill />
        <SummaryLine
          label="Ultimo valor"
          value={`${report.lastValueLabel} (esperado: ${report.expectedValueLabel})`}
        />
        <SummaryLine label="Erro" value={report.errorLabel} danger />
        <SummaryLine label="Diagnostico" value={report.diagnosis} />
        <SummaryLine label="Acao executada" value={report.action} />
        <SummaryLine label="Pendencias" value={report.pending} />
      </View>

      <Text style={styles.sectionTitle}>Motivo do Tecnico</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingText}>
          ! {justification.trim() || 'O selo mecanico esta completamente gasto e nao havia novo selo disponivel em estoque.'}
        </Text>
        <Text style={styles.pendingText}>
          ! Teste de valvula foi adiado por falta de material, mas nao haviam pecas para realizar o teste de estanqueidade.
        </Text>
      </View>

      <SectionHeader title="Checklist Tecnico" />
      <View style={styles.historyRow}>
        <Text style={styles.uncheckedBox}>□</Text>
        <View style={styles.flexOne}>
          <Text style={styles.historyTitle}>Registro de selo mecanico</Text>
          <Text style={styles.historySubtitle}>Testes adiados por falta de material</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      <View style={styles.approvalActionRow}>
        <Pressable accessibilityRole="button" onPress={onApprove} style={styles.approveButton}>
          <Text style={styles.approveLabel}>✓  Aprovar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onReturn} style={styles.returnButton}>
          <Text style={styles.returnLabel}>↶  Devolver</Text>
        </Pressable>
      </View>
    </>
  );
}

function NoSelectedTagScreen({ onBack }: { onBack: () => void }) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      <View style={styles.connectionCard}>
        <Text style={styles.connectionTitle}>Selecione uma tag local</Text>
        <Text style={styles.connectionBody}>
          O detalhe da tag agora depende da identidade baixada no pacote local. Volte ao painel e
          selecione uma tag ou resolva um QR cacheado.
        </Text>
      </View>
    </>
  );
}

// Story 8.7 AC 1/8/9: shell-wide navigation context so any sub-component
// (ScreenHeader, footer affordances, pending-action cards) can reach the
// shell's goHome / popRoute without prop-drilling. The context defaults to
// no-ops so signed-out screens render the plain logo and do nothing on press.
interface ShellNavigation {
  goHome: () => void;
  popRoute: () => boolean;
}
const ShellNavigationContext = createContext<ShellNavigation | null>(null);
function useShellNavigation(): ShellNavigation | null {
  return useContext(ShellNavigationContext);
}

function TagWiseLogo({
  large = false,
  onPress,
}: {
  large?: boolean;
  onPress?: () => void;
}) {
  const label = (
    <Text style={[styles.logo, large ? styles.logoLarge : null]}>
      Tag<Text style={styles.logoAccent}>Wise</Text><Text style={styles.logoMark}>⌜</Text>
    </Text>
  );
  // Story 8.7 AC 1: when an onPress (typically goHome) is supplied, the logo
  // becomes a Pressable that returns the user to the dashboard. Authenticated
  // screens supply this; the signed-out login screen renders the plain text.
  if (!onPress) {
    return label;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar para o painel"
      hitSlop={8}
      onPress={onPress}
      testID="tagwise/header/logo-home"
    >
      {label}
    </Pressable>
  );
}

// Story 8.7 AC 9: every execution-phase screen renders this row near the bottom
// so Voltar / Inicio / Proximo are visibly discoverable. The component consumes
// the shell navigation context so individual screens don't need to thread
// goHome/popRoute through their props. `onProximo` is optional — pass it when
// the screen knows the next stage; omit it to render only Voltar + Inicio.
function NavigationAffordanceRow({
  onProximo,
  proximoLabel = 'Proximo',
}: {
  onProximo?: () => void;
  proximoLabel?: string;
}) {
  const navigation = useShellNavigation();
  if (!navigation) {
    return null;
  }
  return (
    <View style={styles.reportActionGrid}>
      <Pressable
        accessibilityRole="button"
        onPress={navigation.popRoute}
        style={styles.smallGhostButton}
      >
        <Text style={styles.smallGhostLabel}>Voltar</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={navigation.goHome}
        style={styles.smallGhostButton}
      >
        <Text style={styles.smallGhostLabel}>Inicio</Text>
      </Pressable>
      {onProximo ? (
        <Pressable
          accessibilityRole="button"
          onPress={onProximo}
          style={styles.smallActionButton}
        >
          <Text style={styles.smallActionLabel}>{proximoLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Story 8.8 D-02 / D-04: photo card for the technician report screen. Renders
// the sub-step label (Instrumento / Calculo / Checklist / Ponto de loop X%),
// the technician's free-text observation, and an inline "Editar observacao"
// affordance so the technician can add or update the comment without leaving
// the report screen. Kept inline (no new file) per the existing in-place
// component pattern.
function ReportPhotoCard({
  attachment,
  editable,
  onRemove,
  onUpdateTechnicianNote,
}: {
  attachment: SharedExecutionPhotoAttachment;
  editable: boolean;
  onRemove: () => void;
  onUpdateTechnicianNote: (note: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(attachment.technicianNote ?? '');
  const stepLabel = formatPhotoExecutionStepLabel(attachment.executionStepId);
  const contextSubtitle = formatPhotoContextSubtitle({
    contextNote: attachment.contextNote,
    executionStepId: attachment.executionStepId,
  });
  const trimmedNote = (attachment.technicianNote ?? '').trim();

  return (
    <View style={styles.reportPhotoCard}>
      <Image source={{ uri: attachment.previewUri }} style={styles.reportPhotoPreview} />
      <Text style={styles.historyTitle}>{stepLabel}</Text>
      <Text style={styles.historySubtitle}>{contextSubtitle}</Text>
      <Text style={styles.historySubtitle}>
        {attachment.source === 'camera' ? 'Camera' : 'Galeria'} - {attachment.syncState}
      </Text>
      {attachment.syncIssue ? (
        <Text style={styles.pendingText}>
          {/* Story 8.7 AC 12: classify per-attachment errors so the technician
              sees an actionable PT-BR message rather than raw fetch failure
              text. */}
          {classifySyncError({ errorMessage: attachment.syncIssue }).copy}
        </Text>
      ) : null}

      {editing ? (
        <>
          <TextInput
            multiline
            // Story 8.9 C-02: cap technician note at 2000 chars on the mobile
            // input. Backend enforces the same bound in the validator chain.
            maxLength={2000}
            placeholder="Ex: Loop OK, cabos danificados na flange"
            placeholderTextColor={colors.textSubtle}
            style={styles.photoNoteInput}
            value={draft}
            onChangeText={setDraft}
          />
          <View style={styles.reportActionGrid}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onUpdateTechnicianNote(draft.trim().length === 0 ? null : draft);
                setEditing(false);
              }}
              style={styles.smallActionButton}
            >
              <Text style={styles.smallActionLabel}>Salvar observacao</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraft(attachment.technicianNote ?? '');
                setEditing(false);
              }}
              style={styles.smallGhostButton}
            >
              <Text style={styles.smallGhostLabel}>Cancelar</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.pendingText}>
            {trimmedNote.length > 0
              ? `Observacao: ${trimmedNote}`
              : 'Sem observacao do tecnico. Toque em "Editar observacao" para adicionar.'}
          </Text>
          <View style={styles.reportActionGrid}>
            <Pressable
              accessibilityRole="button"
              disabled={!editable}
              onPress={() => {
                setDraft(attachment.technicianNote ?? '');
                setEditing(true);
              }}
              style={[
                styles.smallGhostButton,
                !editable ? styles.disabledAction : null,
              ]}
            >
              <Text style={styles.smallGhostLabel}>Editar observacao</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!editable}
              onPress={onRemove}
              style={[
                styles.smallGhostButton,
                !editable ? styles.disabledAction : null,
              ]}
            >
              <Text style={styles.smallGhostLabel}>Remover</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// Story 8.12 finding #3: read-only 0-100% sweep reference table for the
// standalone Calculadora. Given a PV range and unit, renders the 5 standard
// loop checkpoints with both the expected mA (4-20 mA convention) and the
// expected PV value. Pure helper - never writes anywhere.
function CalculatorSweepPanel({
  processMinRaw,
  processMaxRaw,
  unit,
}: {
  processMinRaw: string;
  processMaxRaw: string;
  unit: string;
}) {
  const parsedMin = parseFloat(processMinRaw.replace(',', '.'));
  const parsedMax = parseFloat(processMaxRaw.replace(',', '.'));
  const ready =
    Number.isFinite(parsedMin) &&
    Number.isFinite(parsedMax) &&
    parsedMax > parsedMin;
  const rows = ready
    ? [0, 25, 50, 75, 100].map((percent) => {
        const milliamp = 4 + (percent / 100) * 16;
        const processValue = parsedMin + (percent / 100) * (parsedMax - parsedMin);
        return {
          percent,
          milliampLabel: `${milliamp.toFixed(2)} mA`,
          processValueLabel: `${processValue.toFixed(3).replace(/\.?0+$/, '')}${unit ? ` ${unit}` : ''}`,
        };
      })
    : [];
  return (
    <View style={styles.connectionCard}>
      <Text style={styles.sectionTitle}>Tabela 0-100% (4-20 mA)</Text>
      <Text style={styles.pendingText}>
        Preencha a faixa PV (campos PV min e PV max acima no Modo Conversao) para ver os
        cinco pontos padrao com a corrente esperada (4-20 mA) e o valor de processo
        correspondente. Tabela de referencia: nao envia dados nem altera testes.
      </Text>
      {ready ? (
        rows.map((row) => (
          <View key={row.percent} style={styles.sweepRow}>
            <Text style={styles.sweepPercent}>{row.percent}%</Text>
            <Text style={styles.sweepValue}>{row.milliampLabel}</Text>
            <Text style={styles.sweepValue}>{row.processValueLabel}</Text>
          </View>
        ))
      ) : (
        <InlineMessage text="Informe PV min, PV max e unidade no Modo Conversao para gerar a tabela." />
      )}
    </View>
  );
}

// Story 8.12 finding #1: standalone thumbnail row used by the instrument
// detail panel and the loop-test per-point block, so any place that
// captures a photo can also display it. Filters by executionStepId or
// contextNote so each surface only shows the photos relevant to its
// context. Reuses the executionPhotoThumb* styles introduced in 8.10.
function PhotoThumbnailRow({
  photos,
  filterStepKind,
  filterContextNote,
  fallbackCaption,
}: {
  photos: readonly SharedExecutionPhotoAttachment[];
  filterStepKind?: SharedExecutionStepKind;
  filterContextNote?: string | null;
  fallbackCaption?: string;
}) {
  const visiblePhotos = photos.filter((photo) => {
    if (filterStepKind && photo.executionStepId !== filterStepKind) {
      return false;
    }
    if (filterContextNote !== undefined && photo.contextNote !== filterContextNote) {
      return false;
    }
    return true;
  });
  if (visiblePhotos.length === 0) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.executionPhotoThumbRow}
    >
      {visiblePhotos.map((photo) => (
        <View key={photo.evidenceId} style={styles.executionPhotoThumbCard}>
          <Image source={{ uri: photo.previewUri }} style={styles.executionPhotoThumb} />
          <Text style={styles.executionPhotoThumbCaption} numberOfLines={1}>
            {photo.contextNote ??
              fallbackCaption ??
              formatPhotoExecutionStepLabel(photo.executionStepId)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// Story 8.7 AC 7: small inline camera/gallery row reusable across loop test,
// single-point calculation, and checklist/guidance screens. The contextNote
// (e.g. "Ponto de loop 50%") is carried on the photo so the report evidence
// area can render which sub-step the photo came from. Kept inline in this
// file per the story's "no new shared component files" guardrail.
function ExecutionPhotoActions({
  contextNote,
  editable = true,
  label,
  onAttach,
  photos,
  filterStepKind,
}: {
  contextNote: string | null;
  editable?: boolean;
  label?: string;
  onAttach: (source: 'camera' | 'library', contextNote: string | null) => void;
  // Story 8.10 finding #5: render thumbnails of already-attached photos so
  // the technician immediately sees that the capture worked. The component
  // filters the full attachment list by `filterStepKind` (when provided) so
  // the calculation screen only shows calculation photos, the checklist
  // screen only shows checklist photos, etc.
  photos?: readonly SharedExecutionPhotoAttachment[];
  filterStepKind?: SharedExecutionStepKind;
}) {
  const visiblePhotos = photos
    ? filterStepKind
      ? photos.filter((p) => p.executionStepId === filterStepKind)
      : photos
    : [];
  return (
    <View style={styles.nextActionPanel}>
      <Text style={styles.pendingTitle}>Foto da execucao</Text>
      <Text style={styles.pendingText}>
        {label ??
          'Anexe uma foto desta etapa quando o instrumento se comportar de forma diferente ou para registrar evidencia.'}
      </Text>
      <View style={styles.reportActionGrid}>
        <Pressable
          accessibilityRole="button"
          disabled={!editable}
          onPress={() => onAttach('camera', contextNote)}
          style={[styles.smallActionButton, !editable ? styles.disabledAction : null]}
        >
          <Text style={styles.smallActionLabel}>Tirar foto</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!editable}
          onPress={() => onAttach('library', contextNote)}
          style={[styles.smallGhostButton, !editable ? styles.disabledAction : null]}
        >
          <Text style={styles.smallGhostLabel}>Da galeria</Text>
        </Pressable>
      </View>
      {visiblePhotos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.executionPhotoThumbRow}
        >
          {visiblePhotos.map((photo) => (
            <View key={photo.evidenceId} style={styles.executionPhotoThumbCard}>
              <Image source={{ uri: photo.previewUri }} style={styles.executionPhotoThumb} />
              <Text style={styles.executionPhotoThumbCaption} numberOfLines={1}>
                {photo.contextNote ?? formatPhotoExecutionStepLabel(photo.executionStepId)}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function ScreenHeader({ onBack, onPressLogo }: { onBack: () => void; onPressLogo?: () => void }) {
  // Story 8.7 AC 1: when no explicit onPressLogo is provided, fall back to the
  // shell's goHome via context. Signed-out screens that render ScreenHeader
  // (none today) would simply not be wrapped in the provider.
  const navigation = useShellNavigation();
  const resolvedOnPressLogo = onPressLogo ?? navigation?.goHome;
  return (
    <View style={styles.screenHeader}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonLabel}>‹</Text>
      </Pressable>
      <TagWiseLogo onPress={resolvedOnPressLogo} />
    </View>
  );
}

function ExecutionUnavailableScreen({
  message,
  onBack,
  title,
  unavailableReason,
}: {
  message: string | null;
  onBack: () => void;
  title: string;
  unavailableReason: string | null;
}) {
  return (
    <>
      <ScreenHeader onBack={onBack} />
      {message ? <InlineMessage text={message} /> : null}
      <View style={styles.connectionCard}>
        <Text style={styles.connectionTitle}>{title}</Text>
        <Text style={styles.connectionBody}>
          {unavailableReason ??
            'Os dados locais de execucao nao estao disponiveis. Volte ao contexto da tag e continue com o que estiver em cache.'}
        </Text>
      </View>
    </>
  );
}

function ExecutionMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.executionMetric}>
      <Text style={styles.historySubtitle}>{label}</Text>
      <Text style={styles.executionMetricValue}>{value}</Text>
    </View>
  );
}

function ExecutionStageStepper({
  activeRoute,
  stages,
  onOpenStage,
}: {
  activeRoute: 'detail' | 'calculation' | 'loop-test' | 'history' | 'diagnosis' | 'report';
  stages: VisualExecutionStage[];
  onOpenStage: (route: VisualStageRoute) => void;
}) {
  if (stages.length === 0) {
    return null;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.stageRail}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {stages.map((stage, index) => {
        const active = stage.route === activeRoute;
        const disabled = stage.route === 'detail';
        return (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            key={`${stage.id}:${stage.route}`}
            onPress={() => onOpenStage(stage.route)}
            style={[styles.stageChip, active ? styles.stageChipActive : null, disabled ? styles.disabledAction : null]}
          >
            <Text style={[styles.stageChipNumber, active ? styles.stageChipTextActive : null]}>
              {index + 1}
            </Text>
            <Text style={[styles.stageChipText, active ? styles.stageChipTextActive : null]}>
              {stage.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ConversionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.conversionButton}>
      <Text style={styles.ghostTileLabel}>{label}</Text>
    </Pressable>
  );
}

function GuidanceChecklistCard({
  editable,
  item,
  onChecklistOutcomeChange,
}: {
  editable: boolean;
  item: VisualExecutionGuidanceViewModel['checklistItems'][number];
  onChecklistOutcomeChange: (
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) => void;
}) {
  const flagged = item.outcome === 'incomplete' || item.outcome === 'skipped';

  return (
    <View style={[styles.guidanceCard, flagged ? styles.guidanceCardWarning : null]}>
      <View style={styles.checklistRow}>
        <Text style={[styles.checklistBox, flagged ? styles.checklistBoxWarning : null]}>
          {checklistOutcomeSymbol(item.outcome)}
        </Text>
        <View style={styles.flexOne}>
          <Text style={styles.historyTitle}>{item.prompt}</Text>
          <Text style={styles.checklistText}>Status: {toChecklistOutcomeLabel(item.outcome)}</Text>
        </View>
      </View>
      <Text style={styles.pendingText}>Por que importa: {item.whyItMatters}</Text>
      <Text style={styles.pendingText}>Ajuda a descartar: {item.helpsRuleOut}</Text>
      <Text style={styles.pendingText}>Fonte: {item.sourceReference}</Text>
      <Text style={styles.historySubtitle}>{describeReferenceSource(item.sourceReference)}</Text>

      <View style={styles.outcomeGrid}>
        <GuidanceOutcomeButton
          active={item.outcome === 'completed'}
          disabled={!editable}
          label="Concluir"
          onPress={() => onChecklistOutcomeChange(item.id, 'completed')}
        />
        <GuidanceOutcomeButton
          active={item.outcome === 'incomplete'}
          disabled={!editable}
          label="Incompleto"
          onPress={() => onChecklistOutcomeChange(item.id, 'incomplete')}
        />
        <GuidanceOutcomeButton
          active={item.outcome === 'skipped'}
          disabled={!editable}
          label="Ignorar"
          onPress={() => onChecklistOutcomeChange(item.id, 'skipped')}
        />
        <GuidanceOutcomeButton
          active={item.outcome === 'pending'}
          disabled={!editable}
          label="Pendente"
          onPress={() => onChecklistOutcomeChange(item.id, 'pending')}
        />
      </View>
    </View>
  );
}

function GuidanceOutcomeButton({
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
        styles.outcomeButton,
        active ? styles.outcomeButtonActive : null,
        disabled ? styles.disabledAction : null,
      ]}
    >
      <Text style={styles.smallGhostLabel}>{label}</Text>
    </Pressable>
  );
}

function GuidanceRiskCard({
  editable,
  item,
  onJustificationChange,
}: {
  editable: boolean;
  item: VisualExecutionGuidanceViewModel['riskItems'][number];
  onJustificationChange: (value: string) => void;
}) {
  const missingJustification =
    item.justificationRequired && item.justificationText.trim().length === 0;

  return (
    <View
      style={[
        styles.guidanceCard,
        item.severity === 'submit-block' || missingJustification
          ? styles.guidanceCardWarning
          : null,
      ]}
    >
      <Text style={styles.historyTitle}>{item.title}</Text>
      <Text style={styles.pendingText}>{item.detail}</Text>
      {item.justificationRequired ? (
        <>
          <Text style={styles.pendingText}>
            {item.justificationPrompt ?? 'Registre uma justificativa de campo para este risco.'}
          </Text>
          <TextInput
            autoCapitalize="sentences"
            autoCorrect
            editable={editable}
            multiline
            onChangeText={onJustificationChange}
            placeholder="Justificativa de risco"
            placeholderTextColor={colors.textSubtle}
            style={[styles.justificationInput, !editable ? styles.disabledAction : null]}
            value={item.justificationText}
          />
        </>
      ) : (
        <Text style={styles.pendingText}>
          Este risco deve ser resolvido antes do envio, mas nao bloqueia a execucao em campo aqui.
        </Text>
      )}
    </View>
  );
}

function GuidancePromptView({
  item,
  title,
}: {
  item: VisualExecutionGuidanceViewModel['guidedDiagnosisPrompts'][number];
  title: string;
}) {
  return (
    <View style={styles.guidanceCard}>
      <Text style={styles.historySubtitle}>{title}</Text>
      <Text style={styles.historyTitle}>{item.prompt}</Text>
      <Text style={styles.pendingText}>Por que importa: {item.whyItMatters}</Text>
      <Text style={styles.pendingText}>Ajuda a descartar: {item.helpsRuleOut}</Text>
      <Text style={styles.pendingText}>Fonte: {item.sourceReference}</Text>
      <Text style={styles.historySubtitle}>{describeReferenceSource(item.sourceReference)}</Text>
    </View>
  );
}

function LinkedGuidanceView({
  item,
}: {
  item: VisualExecutionGuidanceViewModel['linkedGuidance'][number];
}) {
  return (
    <View style={styles.guidanceCard}>
      <Text style={styles.historySubtitle}>Referencia local</Text>
      <Text style={styles.historyTitle}>{item.title}</Text>
      <Text style={styles.pendingText}>{item.summary}</Text>
      <Text style={styles.pendingText}>Por que importa: {item.whyItMatters}</Text>
      <Text style={styles.pendingText}>Fonte: {item.sourceReference}</Text>
      <Text style={styles.historySubtitle}>{describeReferenceSource(item.sourceReference)}</Text>
    </View>
  );
}

function FilterChip({
  active,
  count,
  label,
  onPress,
}: {
  active: boolean;
  count?: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterChip, active ? styles.filterChipActive : null]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text style={[styles.filterChipCount, active ? styles.filterChipCountActive : null]}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  actionLabel?: string;
  icon?: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    </View>
  );
}

function InlineMessage({ text }: { text: string }) {
  return (
    <View style={styles.inlineMessage}>
      <Text style={styles.inlineMessageText}>{text}</Text>
    </View>
  );
}

function RecentTagCard({
  tag,
  onPress,
}: {
  tag: VisualTagSummary;
  onPress: (tag: VisualTagSummary) => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(tag)} style={styles.recentCard}>
      <View style={styles.recentTopRow}>
        <Text style={styles.recentCode}>{tag.code}</Text>
        <Text style={[styles.recentSignal, signalStyle(tag.severity)]}>{signalSymbol(tag.severity)}</Text>
      </View>
      <Text style={styles.recentTitle}>{tag.title}</Text>
      <Text style={styles.recentArea}>{tag.area}</Text>
    </Pressable>
  );
}

function TagSection({
  accentColor,
  reportStatusByTag,
  tags,
  title,
  totalLabel,
  onOpenDetail,
}: {
  accentColor: string;
  reportStatusByTag: Map<string, VisualTagWorkStatus>;
  tags: VisualTagSummary[];
  title: string;
  totalLabel: string;
  onOpenDetail: (tag: VisualTagSummary) => void;
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <View style={styles.sectionShell}>
      <View style={[styles.sectionAccent, { backgroundColor: accentColor }]} />
      <View style={styles.sectionContent}>
        <SectionHeader title={`${title} ${totalLabel}`} />
        {tags.map((tag) => (
          <TagListItem
            key={`${tag.workPackageId}:${tag.id}`}
            status={reportStatusByTag.get(`${tag.workPackageId}:${tag.tagId}`)}
            tag={tag}
            onPress={onOpenDetail}
          />
        ))}
      </View>
    </View>
  );
}

function TagListItem({
  status,
  tag,
  onPress,
}: {
  status?: VisualTagWorkStatus;
  tag: VisualTagSummary;
  onPress: (tag: VisualTagSummary) => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(tag)} style={styles.tagListItem}>
      <View style={[styles.tagAvatar, { borderColor: tag.ringColor }]}>
        <Text style={styles.tagAvatarText}>{tag.prefix}</Text>
      </View>
      <View style={styles.tagListText}>
        <Text style={styles.tagListCode}>{tag.code}</Text>
        <Text style={styles.tagListDescription}>{tag.description}</Text>
      </View>
      <View style={styles.tagListMeta}>
        <StatusPill
          label={status?.label ?? tag.badgeLabel}
          severity={status ? reportStatusSeverity(status.status) : tag.severity}
        />
        <Text style={styles.tagListArea}>{status?.detail ?? tag.badgeDetail}</Text>
      </View>
      <Text style={styles.chevron}>{'>'}</Text>
    </Pressable>
  );
}

function StatusPill({
  label,
  large = false,
  severity,
}: {
  label: string;
  large?: boolean;
  severity: VisualSeverity;
}) {
  return (
    <View style={[styles.statusPill, pillStyle(severity), large ? styles.statusPillLarge : null]}>
      {/* Story 11.5 (issue #3B): cap the label to a single line and let
          the layout truncate with an ellipsis. Combined with the pill's
          maxWidth this guarantees long PT-BR words (e.g. "Desatualizado")
          never overflow the title row on narrow phones. */}
      <Text
        style={[styles.statusPillText, large ? styles.statusPillTextLarge : null]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </View>
  );
}

// Story 8.8 D-05: `MetricLine` now accepts a `variant`. The legacy default is
// 'horizontal' (label on the left, value on the right) for callers that depend
// on the compact two-column layout (status pills, chip pairs). The new
// 'vertical' variant renders the label above the value, full width, so long
// values (asset references, dates, multi-word strings) do not wrap mid-row on
// narrower Android phones. The instrument detail screen uses 'vertical'.
function MetricLine({
  label,
  rightLabel,
  value,
  variant = 'horizontal',
}: {
  label: string;
  rightLabel?: string;
  value: string;
  variant?: 'horizontal' | 'vertical';
}) {
  if (variant === 'vertical') {
    return (
      <View style={styles.metricLineVertical}>
        <Text style={styles.metricLabelVertical}>{label}</Text>
        <Text style={styles.metricValueVertical}>{value}</Text>
        {rightLabel ? <Text style={styles.metricRightLabel}>{rightLabel}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.metricLine}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricLineValue}>{value}</Text>
      {rightLabel ? <Text style={styles.metricRightLabel}>{rightLabel}</Text> : null}
    </View>
  );
}

function InfoPill({ icon, label, warning = false }: { icon: string; label: string; warning?: boolean }) {
  return (
    <View style={styles.infoPill}>
      <Text style={warning ? styles.warningIcon : styles.infoIcon}>{icon}</Text>
      <Text style={[styles.infoPillText, warning ? styles.warningText : null]}>{label}</Text>
    </View>
  );
}

function ActionTile({
  active = false,
  highlight = false,
  icon,
  label,
  onPress,
}: {
  active?: boolean;
  highlight?: boolean;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.actionTile, active ? styles.actionTileActive : null]}
    >
      <Text style={[styles.actionIcon, highlight ? styles.actionIconHighlight : null]}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function GhostTile({ label }: { label: string }) {
  return (
    <View style={styles.ghostTile}>
      <Text style={styles.ghostTileLabel}>{label}</Text>
    </View>
  );
}

// Story 8.8 D-05: `SummaryLine` now accepts a `variant`. The legacy default is
// 'horizontal' for compact short pairs (e.g., chip + status). The new
// 'vertical' variant renders label above value so long sync detail strings,
// long work-package IDs, and multi-word lifecycle labels stay readable on
// narrow Android phones. Used by the technician report header and the
// supervisor review queue/detail screens.
function SummaryLine({
  danger = false,
  label,
  pill = false,
  value,
  variant = 'horizontal',
}: {
  danger?: boolean;
  label: string;
  pill?: boolean;
  value: string;
  variant?: 'horizontal' | 'vertical';
}) {
  if (variant === 'vertical') {
    return (
      <View style={styles.summaryLineVertical}>
        <Text style={styles.summaryLabelVertical}>{label}</Text>
        {pill ? (
          <StatusPill label={value} severity="medium" />
        ) : (
          <Text
            style={[styles.summaryValueVertical, danger ? styles.summaryDanger : null]}
          >
            {value}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      {pill ? (
        <StatusPill label={value} severity="medium" />
      ) : (
        <Text style={[styles.summaryValue, danger ? styles.summaryDanger : null]}>{value}</Text>
      )}
    </View>
  );
}

function ReportSummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reportSummaryBlock}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.reportSummaryText}>{value}</Text>
    </View>
  );
}

function filterTags(
  tags: VisualTagSummary[],
  category: VisualTagCategory | 'all',
  searchQuery: string,
) {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return tags.filter((tag) => {
    const categoryMatches = category === 'all' || tag.category === category;
    const searchMatches =
      normalizedQuery.length === 0 ||
      tag.code.toLowerCase().includes(normalizedQuery) ||
      tag.description.toLowerCase().includes(normalizedQuery) ||
      tag.area.toLowerCase().includes(normalizedQuery);

    return categoryMatches && searchMatches;
  });
}

function formatNumber(value: number) {
  return value.toFixed(value % 1 === 0 ? 1 : 2).replace('.', ',');
}

function toChecklistOutcomeLabel(value: SharedExecutionChecklistOutcome) {
  switch (value) {
    case 'completed':
      return 'Concluido';
    case 'incomplete':
      return 'Incompleto';
    case 'skipped':
      return 'Pulado';
    default:
      return 'Pendente';
  }
}

// Story 8.7 AC 4/9: translate raw history-result enums (e.g. backend seed values
// like 'pass-with-note', 'pass', 'fail') into technician-facing PT-BR copy so
// they never leak into the instrument detail screen as raw kebab-case strings.
function toHistoryResultLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Historico';
  }
  const normalized = value.toString().trim().toLowerCase();
  switch (normalized) {
    case 'pass':
    case 'passed':
    case 'ok':
    case 'pass-with-note':
      // Story 8.14 finding #4: collapse pass-with-note to "Aprovado"
      // here. The detail tile has no room to render the observation
      // context, so the long-form label was confusing the technician.
      // The actual supervisor / technician note is still surfaced
      // inline in the Compare screen's priorReadings panel where it
      // carries meaning.
      return 'Aprovado';
    case 'fail':
    case 'failed':
      return 'Falha';
    case 'incomplete':
      return 'Incompleto';
    case 'skipped':
      return 'Pulado';
    case 'unavailable':
    case 'unknown':
      return 'Indisponivel';
    default:
      return value;
  }
}

function requirementLevelLabel(value: string): string {
  switch (value) {
    case 'minimum':
      return 'Minima';
    case 'expected':
      return 'Esperada';
    default:
      return value;
  }
}

function reviewAccessStateLabel(value: string): string {
  switch (value) {
    case 'available':
      return 'Disponivel';
    case 'connected-required':
      return 'Conexao obrigatoria';
    case 'hidden':
      return 'Oculto';
    case 'signed-out-demo':
      return 'Login obrigatorio';
    default:
      return value;
  }
}

function reviewLifecycleLabel(value: string): string {
  switch (value) {
    // Story 8.8 PT-BR sweep: cover the technician-side draft lifecycle labels
    // (In Progress / Ready to Submit) that were leaking as English when the
    // technician report header reflected the local draft state. The
    // server-side lifecycle labels remain mapped as before.
    case 'In Progress':
      return 'Em andamento';
    case 'Ready to Submit':
      return 'Pronto para enviar';
    case 'Submitted - Pending Supervisor Review':
      return 'Enviado - aguardando supervisor';
    case 'Submitted - Pending Sync':
      return 'Enviado local - pendente sync';
    case 'Escalated - Pending Manager Review':
      return 'Escalado - aguardando gerente';
    case 'Returned by Supervisor':
      return 'Devolvido pelo supervisor';
    case 'Returned by Manager':
      return 'Devolvido pelo gerente';
    case 'Approved':
      return 'Aprovado';
    default:
      return value;
  }
}

function syncLabel(value: string): string {
  switch (value) {
    case 'local-only':
      return 'Somente local';
    case 'queued':
      return 'Na fila';
    case 'syncing':
      return 'Sincronizando';
    case 'pending-validation':
      return 'Validacao pendente';
    case 'synced':
      return 'Sincronizado';
    case 'sync-issue':
      return 'Falha de sync';
    default:
      return value;
  }
}

function checklistOutcomeSymbol(value: SharedExecutionChecklistOutcome) {
  switch (value) {
    case 'completed':
      return 'OK';
    case 'incomplete':
      return '!';
    case 'skipped':
      return '-';
    default:
      return '..';
  }
}

function pillStyle(severity: VisualSeverity) {
  switch (severity) {
    case 'high':
      return styles.pillHigh;
    case 'medium':
      return styles.pillMedium;
    case 'low':
      return styles.pillLow;
    case 'due':
      return styles.pillDue;
    case 'ok':
      return styles.pillOk;
    default:
      return styles.pillMedium;
  }
}

function signalStyle(severity: VisualSeverity) {
  switch (severity) {
    case 'high':
      return styles.signalHigh;
    case 'due':
      return styles.signalDue;
    default:
      return styles.signalOk;
  }
}

function signalSymbol(severity: VisualSeverity) {
  if (severity === 'high') {
    return '!';
  }
  if (severity === 'due') {
    return '!';
  }
  return 'OK';
}

function reportStatusSeverity(status: VisualTechnicianReportSummary['status']): VisualSeverity {
  switch (status) {
    case 'approved':
      return 'ok';
    case 'returned':
    case 'sync-issue':
      return 'high';
    case 'pending-sync':
    case 'pending-review':
    case 'manual-local':
      return 'due';
    default:
      return 'medium';
  }
}

function modeLabel(value: string): string {
  switch (value) {
    case 'pv-to-ma':
      return 'PV -> mA';
    case 'ma-to-pv':
      return 'mA -> PV';
    case 'pv-to-percent':
      return 'PV -> %';
    case 'ma-to-percent':
      return 'mA -> %';
    case 'percent-to-ma':
      return '% -> mA';
    case 'error':
      return 'Erro';
    case 'pv':
      return 'PV';
    case 'ma':
      return 'mA';
    default:
      return value;
  }
}

function isFieldCalculatorMode(value: string): value is FieldCalculatorMode {
  return (
    value === 'pv-to-ma' ||
    value === 'ma-to-pv' ||
    value === 'pv-to-percent' ||
    value === 'ma-to-percent' ||
    value === 'percent-to-ma' ||
    value === 'error'
  );
}

function resolveRangePart(value: string | undefined, part: 'min' | 'max'): string | null {
  const match = value?.match(/(-?\d+(?:[.,]\d+)?)\D+(-?\d+(?:[.,]\d+)?)/);
  if (!match) {
    return null;
  }

  return part === 'min' ? match[1] ?? null : match[2] ?? null;
}

function resolveRangeUnit(value: string | undefined): string | null {
  const match = value?.match(/-?\d+(?:[.,]\d+)?\D+-?\d+(?:[.,]\d+)?\s*(.+)$/);
  return match?.[1]?.trim() || null;
}

function resolveLoopProcessMin(calculation: VisualExecutionCalculationViewModel): string {
  return (
    calculation.conversion.processRange?.min?.toString() ??
    resolveRangePart(calculation.rangeLabel, 'min') ??
    ''
  );
}

function resolveLoopProcessMax(calculation: VisualExecutionCalculationViewModel): string {
  return (
    calculation.conversion.processRange?.max?.toString() ??
    resolveRangePart(calculation.rangeLabel, 'max') ??
    ''
  );
}

function resolveLoopUnit(calculation: VisualExecutionCalculationViewModel): string {
  return calculation.conversion.processRange?.unit ?? resolveRangeUnit(calculation.rangeLabel) ?? calculation.unitLabel;
}

function resolveLoopTolerance(calculation: VisualExecutionCalculationViewModel): string {
  const match = calculation.toleranceLabel.match(/-?\d+(?:[.,]\d+)?/);
  return match?.[0] ?? '';
}

function formatNullableNumber(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : formatNumber(value);
}

function loopSummaryLabel(state: string, overallLabel: string): string {
  if (state === 'incomplete') {
    return 'Pendente';
  }
  if (/fail/i.test(overallLabel)) {
    return 'Fora da tolerancia';
  }
  return 'Aprovado';
}

function loopPointStatusLabel(passed: boolean | null): string {
  if (passed === true) {
    return 'OK';
  }
  if (passed === false) {
    return 'Falha';
  }
  return 'Pendente';
}

function describeReferenceSource(sourceReference: string): string {
  if (!sourceReference) {
    return 'Referencia local do pacote baixado.';
  }
  if (/TAGWISE-BP/i.test(sourceReference)) {
    return 'Boa pratica TagWise baixada no pacote local.';
  }
  if (/IEC|ISA|ABNT|API|NR-/i.test(sourceReference)) {
    return 'Referencia normativa ou procedimento aplicavel ao teste.';
  }
  return 'Fonte de orientacao local vinculada ao template selecionado.';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 96,
    backgroundColor: colors.background,
  },
  stageRail: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  stageChip: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stageChipActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  stageChipNumber: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '900',
  },
  stageChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  stageChipTextActive: {
    color: colors.white,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: type.body,
    marginTop: spacing.sm,
  },
  headerIconRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBubbleLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  iconBadge: {
    position: 'absolute',
    right: 10,
    top: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.blue,
  },
  logo: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  logoLarge: {
    fontSize: type.logo,
  },
  logoAccent: {
    color: colors.blue,
  },
  logoMark: {
    color: colors.blue,
    fontSize: 30,
  },
  searchGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  searchBox: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  searchIcon: {
    color: colors.textMuted,
    fontSize: 40,
    lineHeight: 42,
  },
  microphoneIcon: {
    color: colors.blue,
    fontSize: 22,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  qrButton: {
    width: 126,
    minHeight: 86,
    borderRadius: radius.lg,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  qrIcon: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '900',
  },
  qrButtonLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  chipRow: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  filterChip: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.blue,
  },
  filterChipText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  filterChipCount: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  filterChipCountActive: {
    color: colors.white,
  },
  inlineMessage: {
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  inlineMessageText: {
    color: colors.text,
    fontSize: type.caption,
    fontWeight: '700',
  },
  sectionHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionIcon: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionAction: {
    color: colors.blue,
    fontSize: 16,
    fontWeight: '800',
  },
  recentRow: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  recentCard: {
    width: 145,
    minHeight: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentCode: {
    color: colors.text,
    fontSize: 16,
  },
  recentSignal: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
    overflow: 'hidden',
  },
  signalHigh: {
    backgroundColor: colors.red,
  },
  signalDue: {
    backgroundColor: colors.amber,
    color: colors.background,
  },
  signalOk: {
    backgroundColor: colors.green,
  },
  recentTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  recentArea: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  connectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  connectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  connectionBody: {
    color: colors.textMuted,
    fontSize: type.caption,
    marginTop: spacing.xs,
    maxWidth: 250,
  },
  connectionMessage: {
    color: colors.amber,
    fontSize: type.caption,
    marginTop: spacing.md,
  },
  connectionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickActionPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionButton: {
    width: '48%',
    minHeight: 86,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: 'center',
  },
  quickActionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  quickActionBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  nextActionPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  cameraFrame: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    backgroundColor: colors.background,
  },
  cameraView: {
    flex: 1,
  },
  qrResultBlock: {
    marginTop: spacing.sm,
  },
  qrGuidanceText: {
    color: colors.textMuted,
    fontSize: type.caption,
    marginTop: spacing.xs,
  },
  smallActionButton: {
    minHeight: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.blue,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  smallActionLabel: {
    color: colors.white,
    fontWeight: '800',
    fontSize: type.caption,
  },
  smallGhostButton: {
    minHeight: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  smallGhostLabel: {
    color: colors.text,
    fontWeight: '800',
    fontSize: type.caption,
  },
  disabledAction: {
    opacity: 0.45,
  },
  loginGrid: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  packageList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  packageCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
    gap: spacing.xs,
  },
  darkInput: {
    minHeight: 46,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    fontSize: type.body,
  },
  loopPointCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  loopPointHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  loopInputGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pendingActionCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  // Story 8.7 AC 3: dedicated calculator Resultado panel — accent dark-blue,
  // NOT pendingCard's warning styling. The user must read "result" not
  // "warning" when they look at this.
  resultPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#1F4D7A',
    backgroundColor: '#10243A',
    padding: spacing.md,
    marginVertical: spacing.sm,
    gap: spacing.xs,
  },
  resultPanelTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  resultPanelDetail: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  reportSummaryBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  reportSummaryText: {
    color: colors.text,
    fontSize: type.caption,
    lineHeight: 22,
  },
  stickyActionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  pickerBlock: {
    marginBottom: spacing.md,
  },
  pickerChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pickerChip: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerChipActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  pickerChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  pickerChipTextActive: {
    color: colors.white,
  },
  executionMetricGrid: {
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  executionMetric: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  executionMetricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  conversionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  conversionButton: {
    minWidth: 132,
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  conversionResultCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  guidanceCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  guidanceCardWarning: {
    borderColor: colors.amber,
    backgroundColor: colors.redSoft,
  },
  outcomeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  outcomeButton: {
    minHeight: 42,
    minWidth: 120,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  outcomeButtonActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  sectionShell: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  sectionAccent: {
    width: 5,
    borderTopLeftRadius: radius.sm,
    borderBottomLeftRadius: radius.sm,
  },
  sectionContent: {
    flex: 1,
    paddingLeft: spacing.xs,
  },
  tagListItem: {
    minHeight: 82,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  tagAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAvatarText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  tagListText: {
    flex: 1,
    minWidth: 0,
  },
  tagListCode: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  tagListDescription: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  tagListMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    maxWidth: 116,
  },
  tagListArea: {
    color: colors.textMuted,
    fontSize: type.caption,
    textAlign: 'right',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 36,
    fontWeight: '300',
  },
  statusPill: {
    minHeight: 28,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    // Story 11.5 (issue #3B): cap the pill width and let the text shrink
    // so long PT-BR labels (e.g. "Desatualizado", 13 chars) cannot push
    // off the right edge of a narrow Android phone screen. The minWidth
    // keeps short labels (e.g. "OK") from collapsing.
    maxWidth: 140,
    minWidth: 56,
    flexShrink: 0,
  },
  statusPillLarge: {
    minHeight: 56,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xl,
  },
  statusPillText: {
    fontSize: type.caption,
    fontWeight: '900',
  },
  statusPillTextLarge: {
    color: colors.white,
    fontSize: 28,
  },
  pillHigh: {
    backgroundColor: colors.red,
  },
  pillMedium: {
    backgroundColor: colors.blueSoft,
  },
  pillLow: {
    backgroundColor: '#596477',
  },
  pillDue: {
    backgroundColor: colors.amber,
  },
  pillOk: {
    backgroundColor: colors.green,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonLabel: {
    color: colors.text,
    fontSize: 54,
    lineHeight: 54,
    fontWeight: '300',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  tagHeroTitle: {
    color: colors.text,
    fontSize: type.screenTitle,
    lineHeight: 62,
    fontWeight: '500',
  },
  tagHeroSubtitle: {
    color: colors.textMuted,
    fontSize: 24,
    lineHeight: 30,
  },
  metricPanel: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  metricLine: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricLineVertical: {
    minHeight: 56,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  metricLabelVertical: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricValueVertical: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 18,
    flexBasis: 110,
    flexShrink: 0,
  },
  metricLineValue: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    flex: 1,
    textAlign: 'right',
    flexShrink: 1,
  },
  metricRightLabel: {
    color: colors.textMuted,
    fontSize: 22,
    minWidth: 40,
    textAlign: 'right',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  infoPill: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoIcon: {
    color: colors.amber,
    fontSize: 18,
    fontWeight: '900',
  },
  warningIcon: {
    color: colors.amber,
    fontSize: 22,
  },
  infoPillText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    flexShrink: 1,
  },
  warningText: {
    color: colors.amber,
  },
  sectionBand: {
    marginBottom: spacing.xl,
  },
  templateRow: {
    minHeight: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  templateRowSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  templateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  templateBody: {
    color: colors.textMuted,
    fontSize: type.caption,
    marginTop: spacing.xs,
  },
  resultGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resultTile: {
    flex: 1,
    minHeight: 92,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  resultIcon: {
    color: colors.green,
    fontSize: 28,
    fontWeight: '900',
  },
  resultTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  resultSubtitle: {
    color: colors.textMuted,
    fontSize: 18,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionTile: {
    width: '47%',
    minHeight: 92,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  actionTileActive: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blue,
  },
  actionIcon: {
    color: colors.textMuted,
    fontSize: 26,
    fontWeight: '900',
  },
  actionIconHighlight: {
    color: colors.amber,
  },
  actionLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  selectBox: {
    minHeight: 70,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  selectText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  formLabel: {
    color: colors.textMuted,
    fontSize: 24,
    marginBottom: spacing.sm,
  },
  unitToggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  calculationValueRow: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  bigValue: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  toleranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  toleranceIcon: {
    color: colors.textMuted,
    fontSize: 34,
  },
  toleranceLabel: {
    color: colors.textMuted,
    fontSize: 24,
    flex: 1,
  },
  toleranceValue: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
  },
  failureBar: {
    minHeight: 82,
    borderRadius: radius.md,
    backgroundColor: colors.redSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  failureBarText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    flexShrink: 1,
  },
  bottomActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 150,
  },
  ghostTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostTileLabel: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  chartCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  chartTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  chartValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  currentComparisonValue: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  chartRail: {
    height: 118,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
  },
  chartPointColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: '#e5a657',
  },
  chartBarHot: {
    backgroundColor: colors.red,
  },
  chartDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.amber,
    marginTop: spacing.xs,
  },
  chartDotHot: {
    backgroundColor: colors.red,
  },
  chartLabel: {
    color: colors.textMuted,
    fontSize: type.caption,
    marginTop: spacing.sm,
  },
  historyRow: {
    minHeight: 82,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  // Story 8.10 finding #2: vertical history row variant. Title + pill on the
  // first line; the value (e.g. measured reading) on its own line below at
  // full width; the state label as a small caption underneath. Prevents
  // mid-row wrapping of long labels on narrow Android screens.
  historyRowVertical: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  historyRowVerticalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  historyValueVertical: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  // Story 8.12 finding #6: floating toast overlay. Absolute positioning
  // anchors against the SafeAreaView (not the ScrollView), so the toast
  // stays visible regardless of how far the user has scrolled. The
  // wrapper is `pointerEvents=box-none` so taps pass through to the
  // ScrollView except where the toast card itself sits.
  toastOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: 'stretch',
    zIndex: 100,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastMessage: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  toastDismiss: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfacePressed,
  },
  toastDismissLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 16,
  },
  // Story 8.12 finding #2: invalidated-report banner on the Report
  // screen. Red surface + bold title so the technician immediately sees
  // the report can no longer be re-submitted.
  invalidatedBanner: {
    borderRadius: radius.md,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: colors.red,
    padding: spacing.md,
    marginVertical: spacing.md,
    gap: spacing.xs,
  },
  invalidatedBannerTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  invalidatedBannerBody: {
    color: colors.text,
    fontSize: 14,
  },
  invalidatedBannerReason: {
    color: colors.text,
    fontSize: 13,
    fontStyle: 'italic',
  },
  // Story 8.15: per-point loop test results rendered inline in the
  // Resumo da visita panel on the Report screen. Each row has the
  // setpoint percent, the expected/measured pair, and a pass/fail
  // pill so the technician can scan the curve at a glance.
  loopResultTable: {
    marginTop: spacing.sm,
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  loopResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  loopResultPercent: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    minWidth: 48,
  },
  loopResultValue: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
  },
  // Story 8.12 finding #3: sweep table row inside the calculator's
  // "Tabela 0-100%" panel. Three columns: percent, mA, PV value.
  sweepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  sweepPercent: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    minWidth: 56,
  },
  sweepValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  // Story 8.11 finding #10: per-visit template row inside the
  // Resumo da visita panel on the Report screen.
  visitTemplateRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  visitTemplateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  visitTemplateTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  visitTemplateLine: {
    color: colors.textMuted,
    fontSize: 13,
  },
  visitTemplateNote: {
    color: colors.textSubtle,
    fontSize: 12,
    fontStyle: 'italic',
  },
  // Story 8.11 finding #7: prior reading cards stack vertically on the
  // Compare screen, one card per past visit at the active measurement point.
  priorReadingCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  priorReadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priorReadingDate: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  priorReadingValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  priorReadingSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  priorReadingNote: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  // Story 8.10 finding #5: inline photo thumbnails on the per-step capture
  // screens. The technician sees the photo right where they captured it.
  executionPhotoThumbRow: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  executionPhotoThumbCard: {
    width: 100,
    gap: spacing.xs,
  },
  executionPhotoThumb: {
    width: 100,
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  executionPhotoThumbCaption: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  historyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  historySubtitle: {
    color: colors.textMuted,
    fontSize: 16,
  },
  historyValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginLeft: 'auto',
    flexShrink: 1,
    textAlign: 'right',
  },
  fullWidthPrimary: {
    minHeight: 70,
    borderRadius: radius.sm,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  fullWidthPrimaryIcon: {
    color: colors.amber,
    fontSize: 30,
    fontWeight: '900',
  },
  fullWidthPrimaryLabel: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  screenTitle: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '700',
    marginBottom: spacing.xl,
  },
  diagnosisCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  symptomRow: {
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  symptomRowSelected: {
    borderColor: colors.blue,
  },
  symptomText: {
    color: colors.textMuted,
    fontSize: 22,
  },
  symptomTextSelected: {
    color: '#9ec5ff',
    fontWeight: '800',
  },
  checkmark: {
    color: '#9ec5ff',
    fontSize: 26,
    fontWeight: '900',
  },
  kicker: {
    color: colors.textSubtle,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  hypothesisCard: {
    minHeight: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  hypothesisIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.textMuted,
    color: colors.background,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '900',
    overflow: 'hidden',
  },
  hypothesisText: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  nextStepCard: {
    minHeight: 62,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  nextStepIcon: {
    color: colors.amber,
    fontSize: 24,
    fontWeight: '900',
  },
  nextStepText: {
    color: colors.text,
    fontSize: 20,
    flex: 1,
  },
  whyBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xl,
    marginTop: spacing.xl,
  },
  whyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  whyBody: {
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 25,
    marginTop: spacing.md,
    paddingLeft: spacing.xl,
  },
  checklistBlock: {
    marginTop: spacing.xl,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  checklistBox: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.green,
    color: colors.white,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
    overflow: 'hidden',
  },
  checklistBoxWarning: {
    backgroundColor: colors.amber,
    color: colors.background,
  },
  checklistText: {
    color: colors.textMuted,
    fontSize: 19,
    flex: 1,
  },
  summaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryLine: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  summaryLineVertical: {
    minHeight: 58,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  summaryLabelVertical: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  summaryValueVertical: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 18,
    minWidth: 110,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 18,
    flex: 1,
    fontWeight: '700',
  },
  summaryDanger: {
    color: '#ff9ba3',
  },
  attachmentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  attachmentThumb: {
    flex: 1,
    aspectRatio: 1.35,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentIcon: {
    color: colors.text,
    fontSize: 28,
  },
  attachmentLabel: {
    color: colors.textMuted,
    fontSize: type.caption,
    marginTop: spacing.xs,
  },
  reportActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  reportPhotoGrid: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  reportPhotoCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  reportPhotoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  // Story 10.2 (issue #4): inline photo preview for the supervisor review
  // detail screen, sourced from the pre-signed download URL fetched by
  // SupervisorReviewService.loadReportDetail.
  supervisorPhotoImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  reportInlineButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  pendingCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  pendingTitle: {
    color: colors.amber,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  pendingText: {
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 25,
    marginBottom: spacing.sm,
  },
  justificationInput: {
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoNoteInput: {
    minHeight: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    textAlignVertical: 'top',
  },
  uncheckedBox: {
    color: colors.textSubtle,
    fontSize: 30,
    fontWeight: '900',
  },
  flexOne: {
    flex: 1,
  },
  approvalActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 150,
  },
  approveButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveLabel: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  returnButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFullWidth: {
    minHeight: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  returnLabel: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '900',
  },
});
