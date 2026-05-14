import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  SharedExecutionShell,
} from '../features/execution/model';
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
} from '../features/work-packages/model';
import type { ManualInstrumentInput } from '../features/work-packages/manualInstrumentModel';
import type { LocalQrScanResult } from '../features/work-packages/localQrScanService';

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
  reportSyncDetail: ReportSyncDetail | null;
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
  onDownloadPackage: (workPackageId: string) => Promise<void>;
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
  onReportReviewNotesChange: (value: string) => void;
  onSaveReportDraft: () => Promise<void>;
  // Story 8.7 AC 7: the optional `contextNote` carries sub-step context (e.g.
  // "Ponto de loop 50%") so a photo taken during a loop test point can be
  // labeled correctly in the report evidence area.
  onAttachReportPhoto: (
    source: 'camera' | 'library',
    contextNote?: string | null,
  ) => Promise<void>;
  onRemoveReportPhoto: (evidenceId: string) => Promise<void>;
  onSubmitReport: () => Promise<void>;
  onRetryReportSync: () => Promise<void>;
  onRefreshReportServerStatus: () => Promise<void>;
  onRefreshSupervisorReviewQueue: () => Promise<void>;
  onOpenSupervisorReviewReport: (reportId: string) => Promise<void>;
  onCloseSupervisorReviewReport: () => void;
  onApproveSupervisorReviewReport: (reportId: string) => Promise<void>;
  onReturnSupervisorReviewReport: (reportId: string) => Promise<void>;
  onEscalateSupervisorReviewReport: (reportId: string) => Promise<void>;
  onSupervisorReturnCommentChange: (value: string) => void;
  onSupervisorEscalationRationaleChange: (value: string) => void;
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
  reportSyncDetail,
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
  onDownloadPackage,
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
  onReportReviewNotesChange,
  onSaveReportDraft,
  onAttachReportPhoto,
  onRemoveReportPhoto,
  onSubmitReport,
  onRetryReportSync,
  onRefreshReportServerStatus,
  onRefreshSupervisorReviewQueue,
  onOpenSupervisorReviewReport,
  onCloseSupervisorReviewReport,
  onApproveSupervisorReviewReport,
  onReturnSupervisorReviewReport,
  onEscalateSupervisorReviewReport,
  onSupervisorReturnCommentChange,
  onSupervisorEscalationRationaleChange,
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
    () => buildVisualReportProjection(executionShell, reportSyncDetail),
    [executionShell, reportSyncDetail],
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
    () => buildVisualReviewDetailProjection(selectedSupervisorReviewReport, reviewAccess),
    [reviewAccess, selectedSupervisorReviewReport],
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

    if (session && !selectedExecutionTemplateId) {
      setShellMessage('Selecione um teste baixado antes de abrir a etapa tecnica.');
    } else if (session && selectedExecutionTemplateId) {
      const didLoad = await onProceedToExecutionShell();
      if (!didLoad) {
        setShellMessage('O teste local nao esta disponivel para esta tag/template.');
      }
    }

    setRoute(nextRoute);
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
      setRoute(pattern.route);
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
    const note = formatLoopTestEvidenceNote({
      rows: result.rows,
      summary: result.summary,
      inputMode: loopInputMode,
      unit: serviceCalculation.conversion.processRange?.unit ?? serviceCalculation.unitLabel,
    });

    await onSaveLoopTestNote(note);
    setShellMessage('Teste de loop salvo localmente. Proximo: comparar historico ou abrir checklist.');
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
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
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
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <ShellNavigationContext.Provider value={{ goHome, popRoute }}>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
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
            onRefreshPackages={onRefreshPackages}
            onOpenReview={() => void handleOpenReviewRoute()}
            onResolveQrManualPayload={() => void handleResolveQrManualPayload()}
            onQrManualPayloadChange={onQrManualPayloadChange}
            onSearchChange={setSearchQuery}
            onSignIn={onSignIn}
            onStartQrScanner={onStartQrScanner}
            onSwitchUser={onSwitchUser}
            qrManualPayload={qrManualPayload}
            qrScanResult={qrScanResult}
            qrScannerVisible={qrScannerVisible}
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
            lastValueLabel={model.lastValueLabel}
            selectedExecutionTemplateId={selectedExecutionTemplateId}
            selectedTag={selectedTag}
            selectedTagContext={selectedTagContext}
            variableRangeLabel={model.variableRangeLabel}
            onBack={() => openRoute('dashboard')}
            onOpenCalculation={() => void handleOpenExecutionRoute('calculation')}
            onOpenCalculator={() => openCalculator('detail')}
            onOpenDiagnosis={() => void handleOpenExecutionRoute('diagnosis')}
            onOpenHistory={() => void handleOpenExecutionRoute('history')}
            onOpenReport={() => void handleOpenExecutionRoute('report')}
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
              onAttachExecutionPhoto={(source, contextNote) =>
                void onAttachReportPhoto(source, contextNote)
              }
              onBack={() => openRoute('detail')}
              onOpenCalculator={() => openCalculator('calculation')}
              onOpenStage={handleOpenStageRoute}
              onInputChange={onCalculationInputChange}
              onSaveCalculation={async () => {
                await onSaveCalculation();
                setShellMessage('Calculo salvo localmente. Proximo: comparar historico ou abrir checklist.');
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
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              stages={executionStages}
              onAttachExecutionPhoto={(source, contextNote) =>
                void onAttachReportPhoto(source, contextNote)
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
              onAttachExecutionPhoto={(source, contextNote) =>
                void onAttachReportPhoto(source, contextNote)
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
    </SafeAreaView>
    </ShellNavigationContext.Provider>
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
  onQrManualPayloadChange,
  onOpenReports,
  onOpenReview,
  onOpenStandaloneCalculator,
  onResolveQrManualPayload,
  onRefreshPackages,
  onSearchChange,
  onSignIn,
  onStartQrScanner,
  onSwitchUser,
  qrManualPayload,
  qrScanResult,
  qrScannerVisible,
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
  onQrManualPayloadChange: (value: string) => void;
  onOpenReports: () => void;
  onOpenReview: () => void;
  onOpenStandaloneCalculator: () => void;
  onResolveQrManualPayload: () => void;
  onRefreshPackages: () => void;
  onSearchChange: (value: string) => void;
  onSignIn: () => void;
  onStartQrScanner: () => void;
  onSwitchUser: () => void;
  qrManualPayload: string;
  qrScanResult: LocalQrScanResult | null;
  qrScannerVisible: boolean;
}) {
  const navigation = useShellNavigation();
  return (
    <>
      <View style={styles.dashboardHeader}>
        <View>
          <TagWiseLogo large onPress={navigation?.goHome} />
          <Text style={styles.headerSubtitle}>Campo, calculo e relatorio por tag</Text>
        </View>
      </View>

      {session ? (
        <DashboardActionPanel
          reports={technicianReports}
          onOpenManualInstrument={onOpenManualInstrument}
          onOpenReports={onOpenReports}
          onOpenStandaloneCalculator={onOpenStandaloneCalculator}
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
  onRefreshPackages,
}: {
  packageBusy: boolean;
  preparation: VisualWorkPackagePreparationProjection;
  onBrowsePackageTags: (workPackageId: string) => void;
  onDownloadPackage: (workPackageId: string) => void;
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
  onOpenManualInstrument,
  onOpenReports,
  onOpenStandaloneCalculator,
}: {
  reports: VisualTechnicianReportSummary[];
  onOpenManualInstrument: () => void;
  onOpenReports: () => void;
  onOpenStandaloneCalculator: () => void;
}) {
  const pendingSync = reports.filter((report) => report.status === 'pending-sync').length;
  const returned = reports.filter((report) => report.status === 'returned').length;

  return (
    <View style={styles.quickActionPanel}>
      <Text style={styles.sectionTitle}>O que fazer agora?</Text>
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
        <View style={styles.quickActionButton}>
          <Text style={styles.quickActionTitle}>Correcoes</Text>
          <Text style={styles.quickActionBody}>{returned} devolvido(s) para retrabalho.</Text>
        </View>
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
  const [helperMode, setHelperMode] = useState<'conversion' | 'loop'>('conversion');
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
            Modo: Conversao
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
            Modo: Loop
          </Text>
        </Pressable>
      </View>

      {helperMode === 'conversion' ? (
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
            {busy ? 'Loading review...' : 'Open review queue'}
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
  onBack,
  onOpenCalculation,
  onOpenCalculator,
  onOpenDiagnosis,
  onOpenHistory,
  onOpenReport,
  onSelectExecutionTemplate,
}: {
  lastValueLabel: string;
  selectedExecutionTemplateId: string | null;
  selectedTag: VisualTagSummary;
  selectedTagContext: LocalTagContext | null;
  variableRangeLabel: string;
  onBack: () => void;
  onOpenCalculation: () => void;
  onOpenCalculator: () => void;
  onOpenDiagnosis: () => void;
  onOpenHistory: () => void;
  onOpenReport: () => void;
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

      <View style={styles.metricPanel}>
        <MetricLine label="Faixa" value={variableRangeLabel} />
        <View style={styles.separator} />
        <MetricLine
          label="Tolerancia"
          value={selectedTagContext?.tolerance.value ?? 'Indisponivel'}
        />
        <View style={styles.separator} />
        <MetricLine label="Ultimo valor" value={lastValueLabel} />
        <View style={styles.separator} />
        <MetricLine label="Area" value={selectedTagContext?.area.value ?? selectedTag.area} />
        <View style={styles.separator} />
        <MetricLine
          label="Ativo"
          value={selectedTagContext?.parentAssetReference.value ?? selectedTag.badgeDetail}
        />
        <View style={styles.separator} />
        <MetricLine
          label="Vencimento"
          value={selectedTagContext?.dueIndicator.value ?? 'Indisponivel'}
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

      <View style={styles.sectionBand}>
        <SectionHeader title="Escolher teste" />
        {templates.length > 0 ? (
          templates.map((template) => {
            const selected = template.id === selectedExecutionTemplateId;
            const pattern = resolveVisualExecutionPattern(template);
            return (
              <Pressable
                accessibilityRole="button"
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
                <StatusPill
                  label={selected ? 'Abrindo' : 'Iniciar'}
                  severity={selected ? 'ok' : 'medium'}
                />
              </Pressable>
            );
          })
        ) : (
          <InlineMessage text="Nenhum template local disponivel para esta tag." />
        )}
        <View style={styles.resultGrid}>
          <Pressable accessibilityRole="button" onPress={onOpenCalculation} style={styles.resultTile}>
            <Text style={styles.resultIcon}>✓</Text>
            {/* Story 8.7 AC 8: replace the raw "Template / necessario" tile with
                technician-facing PT-BR copy that depends on selection state. */}
            <Text style={styles.resultTitle}>
              {selectedExecutionTemplateId ? 'Pronto para medir' : 'Selecione um teste'}
            </Text>
            <Text style={styles.resultSubtitle}>
              {selectedExecutionTemplateId ? 'toque para abrir' : 'lista abaixo'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenHistory} style={styles.resultTile}>
            <Text style={styles.resultIcon}>▥</Text>
            <Text style={styles.resultTitle}>
              {toHistoryResultLabel(selectedTagContext?.historyPreview.lastResult)}
            </Text>
            <Text style={styles.resultSubtitle}>{selectedTagContext?.historyPreview.state ?? 'demo'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actionGrid}>
        {/* Story 8.7 AC 2: the bottom "Calcular" action opens the standalone
            calculator helper, not the measurement screen. The measurement
            screen is reachable via the template row "Iniciar" and the
            result tile above. */}
        <ActionTile active icon="▦" label="Calcular" onPress={onOpenCalculator} />
        <ActionTile icon="⇄" label="Comparar" onPress={onOpenHistory} />
        <ActionTile highlight icon="⌁" label="Diagnosticar" onPress={onOpenDiagnosis} />
        <ActionTile icon="▤" label="Registrar" onPress={onOpenReport} />
      </View>
    </>
  );
}

function ServiceCalculationScreen({
  calculation,
  stages,
  selectedTag,
  shellMessage,
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
      />
      <View style={styles.nextActionPanel}>
        <Text style={styles.pendingTitle}>Proximo passo</Text>
        <Text style={styles.pendingText}>
          Salve a medicao, compare com o historico ou abra o checklist tecnico.
        </Text>
        <View style={styles.reportActionGrid}>
          <Pressable accessibilityRole="button" onPress={onOpenCalculator} style={styles.smallGhostButton}>
            <Text style={styles.smallGhostLabel}>Calculadora</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onOpenStage('history')} style={styles.smallActionButton}>
            <Text style={styles.smallActionLabel}>Comparar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onOpenStage('diagnosis')} style={styles.smallActionButton}>
            <Text style={styles.smallActionLabel}>Checklist</Text>
          </Pressable>
        </View>
      </View>

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
      <NavigationAffordanceRow
        onProximo={() => onOpenStage('history')}
        proximoLabel="Proximo: Comparar"
      />
    </>
  );
}

function LoopExecutionScreen({
  calculation,
  inputMode,
  points,
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
          <Pressable accessibilityRole="button" onPress={() => onOpenStage('history')} style={styles.smallActionButton}>
            <Text style={styles.smallActionLabel}>Comparar</Text>
          </Pressable>
        </View>
      </View>
      <NavigationAffordanceRow
        onProximo={() => onOpenStage('history')}
        proximoLabel="Proximo: Comparar"
      />
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

  if (history.state === 'unavailable' && history.rows.length === 0) {
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
        {selectedPoint && selectedPoint.rows.length > 0 ? (
          <View style={styles.chartRail}>
            {selectedPoint.rows.slice(0, 6).map((row, index) => (
              <View key={`${row.label}:${row.value}`} style={styles.chartPointColumn}>
                <View
                  style={[
                    styles.chartBar,
                    { height: 24 + (index % 4) * 18 },
                    row.severity === 'due' || row.severity === 'high' ? styles.chartBarHot : null,
                  ]}
                />
                <View
                  style={[
                    styles.chartDot,
                    row.severity === 'due' || row.severity === 'high' ? styles.chartDotHot : null,
                  ]}
                />
                <Text style={styles.chartLabel}>{row.stateLabel}</Text>
              </View>
            ))}
          </View>
        ) : (
          // Story 8.7 AC 6/10: insufficient-history is no longer a dead text
          // card. Tapping it routes to diagnosis so the technician can add the
          // risk justification that explains the missing history.
          <Pressable
            accessibilityRole="button"
            onPress={onOpenDiagnosis}
            style={styles.pendingCard}
          >
            <Text style={styles.pendingTitle}>
              {selectedPoint?.emptyLabel ?? 'Sem dados suficientes para grafico.'}
            </Text>
            <Text style={styles.smallGhostLabel}>Tocar para justificar no checklist</Text>
          </Pressable>
        )}
        <Text style={styles.pendingText}>{history.summary}</Text>
        <Text style={styles.pendingText}>{history.detail}</Text>
      </View>

      <SectionHeader icon="H" title="Linha do tempo do ponto selecionado" />
      {selectedPoint && selectedPoint.rows.length > 0 ? (
        selectedPoint.rows.map((row) => (
          <View key={`${row.label}:${row.value}`} style={styles.historyRow}>
            <View style={styles.flexOne}>
              <Text style={styles.historyTitle}>{row.label}</Text>
              <Text style={styles.historySubtitle}>{row.stateLabel}</Text>
            </View>
            <Text style={styles.historyValue}>{row.value}</Text>
            <StatusPill label={row.stateLabel} severity={row.severity} />
          </View>
        ))
      ) : (
        // Story 8.7 AC 6/10: empty timeline is Pressable to route into diagnosis
        // for the risk justification step.
        <Pressable
          accessibilityRole="button"
          onPress={onOpenDiagnosis}
          style={styles.pendingCard}
        >
          <Text style={styles.pendingTitle}>
            {selectedPoint?.emptyLabel ?? 'Nenhum campo de historico local esta em cache para esta tag.'}
          </Text>
          <Text style={styles.smallGhostLabel}>Tocar para justificar no checklist</Text>
        </Pressable>
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
}: {
  report: VisualReportProjection;
  stages: VisualExecutionStage[];
  shellMessage: string | null;
  syncBusy: boolean;
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

      <View style={styles.summaryCard}>
        <SummaryLine label="Tag" value={report.tagCode} />
        <SummaryLine label="Template" value={report.templateTitle} />
        <SummaryLine label="Ciclo" value={reviewLifecycleLabel(report.lifecycleStateLabel)} pill />
        <SummaryLine label="Estado" value={report.reportStateLabel} />
        <SummaryLine label="Sync" value={`${syncLabel(report.syncBadge.state)}: ${report.syncBadge.detail}`} />
      </View>

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
      <View style={styles.nextActionPanel}>
        <Text style={styles.pendingTitle}>Fotos e anexos</Text>
        <Text style={styles.pendingText}>
          Adicione fotos ou arquivos da galeria quando o procedimento pedir evidencia minima ou esperada.
        </Text>
      </View>
      <View style={styles.reportActionGrid}>
        <Pressable
          accessibilityRole="button"
          disabled={!report.editable}
          onPress={onAttachCamera}
          style={[styles.smallActionButton, !report.editable ? styles.disabledAction : null]}
        >
          <Text style={styles.smallActionLabel}>Camera</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!report.editable}
          onPress={onAttachLibrary}
          style={[styles.smallGhostButton, !report.editable ? styles.disabledAction : null]}
        >
          <Text style={styles.smallGhostLabel}>Galeria</Text>
        </Pressable>
      </View>

      {report.evidenceReferences.map((reference) => (
        <View
          key={`${reference.evidenceKind}:${reference.label}`}
          style={[
            styles.guidanceCard,
            !reference.satisfied && reference.requirementLevel === 'minimum'
              ? styles.guidanceCardWarning
              : null,
          ]}
        >
          <Text style={styles.historyTitle}>{reference.label}</Text>
          <Text style={styles.pendingText}>
            {reference.requirementLevel.toUpperCase()} - {reference.stateLabel}
          </Text>
          <Text style={styles.pendingText}>{reference.detail}</Text>
        </View>
      ))}

      {report.photoAttachments.length > 0 ? (
        <View style={styles.reportPhotoGrid}>
          {report.photoAttachments.map((attachment) => (
            <View key={attachment.evidenceId} style={styles.reportPhotoCard}>
              <Image source={{ uri: attachment.previewUri }} style={styles.reportPhotoPreview} />
              <Text style={styles.historyTitle}>{attachment.fileName}</Text>
              <Text style={styles.historySubtitle}>
                {attachment.source} - {attachment.syncState}
              </Text>
              {attachment.syncIssue ? (
                <Text style={styles.pendingText}>
                  {/* Story 8.7 AC 12: classify per-attachment errors so the
                      technician sees an actionable PT-BR message rather than
                      raw fetch failure text. */}
                  {classifySyncError({ errorMessage: attachment.syncIssue }).copy}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!report.editable}
                onPress={() => onRemovePhoto(attachment.evidenceId)}
                style={[
                  styles.smallGhostButton,
                  styles.reportInlineButton,
                  !report.editable ? styles.disabledAction : null,
                ]}
              >
                <Text style={styles.smallGhostLabel}>Remover</Text>
              </Pressable>
            </View>
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
      {report.riskFlags.length > 0 ? (
        report.riskFlags.map((riskFlag) => (
          <View
            key={riskFlag.id}
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
          </View>
        ))
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>Nenhum risco local esta ativo neste relatorio.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Observacoes do tecnico</Text>
      {!report.editable && report.editLockReason ? (
        <InlineMessage text={report.editLockReason} />
      ) : null}
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={report.editable}
        multiline
        onChangeText={onReviewNotesChange}
        placeholder="Adicione observacoes, correcoes ou notas finais para revisao..."
        placeholderTextColor={colors.textSubtle}
        style={[styles.justificationInput, !report.editable ? styles.disabledAction : null]}
        value={report.reviewNotes}
      />

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

      <Pressable
        accessibilityRole="button"
        disabled={!report.canSaveDraft}
        onPress={onSaveDraft}
        style={[styles.secondaryFullWidth, !report.canSaveDraft ? styles.disabledAction : null]}
      >
        <Text style={styles.returnLabel}>Salvar rascunho</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!report.canSubmit}
        onPress={onSubmitReport}
        style={[styles.fullWidthPrimary, !report.canSubmit ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Enviar para fila local</Text>
      </Pressable>
      {!report.canSubmit ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Envio ainda bloqueado</Text>
          <Text style={styles.pendingText}>{report.submitReadinessLabel}</Text>
          <Text style={styles.pendingText}>
            Toque em uma pendencia acima para ir direto para a justificativa ou evidencia necessaria.
          </Text>
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
                <SummaryLine label="Ciclo" value={reviewLifecycleLabel(item.statusLabel)} />
                <SummaryLine label="Pacote" value={item.workPackageId} />
                <SummaryLine label="Riscos" value={`${item.riskFlagCount}`} />
                <SummaryLine label="Evidencias pendentes" value={`${item.pendingEvidenceCount}`} />
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
        <SummaryLine label="Ciclo" value={reviewLifecycleLabel(detail.lifecycleStateLabel)} pill />
        <SummaryLine label="Sync" value={syncLabel(detail.syncStateLabel)} />
        {detail.summaryRows.map((row) => (
          <SummaryLine key={row.label} label={row.label} value={row.value} />
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
            <Text style={styles.pendingTitle}>{photo.evidenceId}</Text>
            <Text style={styles.pendingText}>Evidencia servidor: {photo.serverEvidenceId ?? 'Nenhuma'}</Text>
            <Text style={styles.pendingText}>Sync: {photo.syncState}</Text>
            <Text style={styles.pendingText}>Finalizada: {photo.finalizedLabel}</Text>
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
}: {
  contextNote: string | null;
  editable?: boolean;
  label?: string;
  onAttach: (source: 'camera' | 'library', contextNote: string | null) => void;
}) {
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
      <Text style={[styles.statusPillText, large ? styles.statusPillTextLarge : null]}>
        {label}
      </Text>
    </View>
  );
}

function MetricLine({
  label,
  rightLabel,
  value,
}: {
  label: string;
  rightLabel?: string;
  value: string;
}) {
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

function SummaryLine({
  danger = false,
  label,
  pill = false,
  value,
}: {
  danger?: boolean;
  label: string;
  pill?: boolean;
  value: string;
}) {
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
      return 'Aprovado';
    case 'pass-with-note':
      return 'Aprovado com observacao';
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
