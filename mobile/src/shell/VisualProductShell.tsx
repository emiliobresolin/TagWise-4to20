import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
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
  convertLoopValue,
  type VisualExecutionCalculationViewModel,
  type VisualExecutionGuidanceViewModel,
  type VisualExecutionHistoryViewModel,
  type VisualLoopConversionMode,
  type VisualLoopConversionResult,
} from '../features/visual-shell/serviceBackedExecution';
import {
  buildVisualReportProjection,
  createVisualReportActions,
  type VisualReportProjection,
} from '../features/visual-shell/serviceBackedReport';
import {
  buildVisualReviewAccess,
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
import type { LocalQrScanResult } from '../features/work-packages/localQrScanService';

type VisualRoute =
  | 'dashboard'
  | 'detail'
  | 'calculation'
  | 'history'
  | 'diagnosis'
  | 'report'
  | 'review'
  | 'approval';

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
  onOpenTag: (identity: VisualTagIdentity) => Promise<boolean>;
  onStartQrScanner: () => void;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
  onQrManualPayloadChange: (value: string) => void;
  onResolveQrManualPayload: () => Promise<LocalQrScanResult | null>;
  onCancelQrScanner: () => void;
  onSelectExecutionTemplate: (templateId: string) => void;
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
  onReportReviewNotesChange: (value: string) => void;
  onSaveReportDraft: () => Promise<void>;
  onAttachReportPhoto: (source: 'camera' | 'library') => Promise<void>;
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
  onOpenTag,
  onStartQrScanner,
  onBarcodeScanned,
  onQrManualPayloadChange,
  onResolveQrManualPayload,
  onCancelQrScanner,
  onSelectExecutionTemplate,
  onProceedToExecutionShell,
  onCalculationInputChange,
  onSaveCalculation,
  onChecklistOutcomeChange,
  onObservationNotesChange,
  onRiskJustificationChange,
  onSaveGuidanceEvidence,
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
  const [route, setRoute] = useState<VisualRoute>('dashboard');
  const [activeFilter, setActiveFilter] = useState<VisualTagCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDemoTag, setSelectedDemoTag] = useState<VisualTagSummary | null>(null);
  const [selectedSymptom, setSelectedSymptom] = useState('Sem Resposta');
  const [justification, setJustification] = useState('');
  const [activeReviewGroupKey, setActiveReviewGroupKey] =
    useState<VisualReviewQueueGroupKey>('pending-review');
  const [pendingReviewDecision, setPendingReviewDecision] =
    useState<VisualReviewDecisionRequest | null>(null);
  const [shellMessage, setShellMessage] = useState<string | null>(null);
  const model = useMemo(
    () =>
      buildTechnicianVisualWorkflow({
        authenticated: Boolean(session),
        workPackages,
        localTags: visibleTags,
        selectedTag: selectedLocalTag,
        selectedTagContext,
      }),
    [selectedLocalTag, selectedTagContext, session, visibleTags, workPackages],
  );
  const serviceCalculation = useMemo(
    () => buildVisualExecutionCalculation(executionShell),
    [executionShell],
  );
  const serviceHistory = useMemo(() => buildVisualExecutionHistory(executionShell), [
    executionShell,
  ]);
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
  const visibleDashboardTags = filterTags(
    [...model.pendingTags, ...model.recurrentTags, ...model.dueTags],
    activeFilter,
    searchQuery,
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

  function openRoute(nextRoute: VisualRoute) {
    setShellMessage(null);
    setRoute(nextRoute);
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
      setShellMessage('Select a cached execution template before opening the technical screen.');
    } else if (session && selectedExecutionTemplateId) {
      const didLoad = await onProceedToExecutionShell();
      if (!didLoad) {
        setShellMessage('The local execution shell is unavailable for this selected tag/template.');
      }
    }

    setRoute(nextRoute);
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
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {route === 'dashboard' ? (
          <DashboardScreen
            activeFilter={activeFilter}
            apiBaseUrl={apiBaseUrl}
            authBusy={authBusy}
            authMessage={authMessage}
            email={email}
            model={model}
            packageBusy={packageBusy}
            password={password}
            reviewAccess={reviewAccess}
            reviewBusy={reviewBusy}
            reviewQueueCount={supervisorReviewQueue.length}
            searchQuery={searchQuery}
            session={session}
            shellMessage={shellMessage}
            visibleTags={visibleDashboardTags}
            onEmailChange={onEmailChange}
            onFilterChange={setActiveFilter}
            onOpenDetail={(tag) => void handleOpenTag(tag)}
            onPasswordChange={onPasswordChange}
            onBarcodeScanned={onBarcodeScanned}
            onCancelQrScanner={onCancelQrScanner}
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
        ) : route === 'detail' && selectedTag ? (
          <TagDetailScreen
            lastValueLabel={model.lastValueLabel}
            selectedExecutionTemplateId={selectedExecutionTemplateId}
            selectedTag={selectedTag}
            selectedTagContext={selectedTagContext}
            variableRangeLabel={model.variableRangeLabel}
            onBack={() => openRoute('dashboard')}
            onOpenCalculation={() => void handleOpenExecutionRoute('calculation')}
            onOpenDiagnosis={() => void handleOpenExecutionRoute('diagnosis')}
            onOpenHistory={() => void handleOpenExecutionRoute('history')}
            onOpenReport={() => void handleOpenExecutionRoute('report')}
            onSelectExecutionTemplate={onSelectExecutionTemplate}
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
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              onBack={() => openRoute('detail')}
              onInputChange={onCalculationInputChange}
              onSaveCalculation={() => void onSaveCalculation()}
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
              history={serviceHistory}
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              onBack={() => openRoute('detail')}
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
              selectedTag={selectedTag}
              shellMessage={shellMessage ?? authMessage}
              onBack={() => openRoute('detail')}
              onChecklistOutcomeChange={onChecklistOutcomeChange}
              onObservationNotesChange={onObservationNotesChange}
              onOpenReport={() => openRoute('report')}
              onRiskJustificationChange={onRiskJustificationChange}
              onSaveGuidanceEvidence={() => void onSaveGuidanceEvidence()}
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
              shellMessage={shellMessage ?? authMessage}
              syncBusy={syncBusy}
              onAttachCamera={() => void reportActions.attachPhotoFromCamera()}
              onAttachLibrary={() => void reportActions.attachPhotoFromLibrary()}
              onBack={() => openRoute('diagnosis')}
              onRefreshServerStatus={() => void reportActions.refreshServerStatus()}
              onRemovePhoto={(evidenceId) => void reportActions.removePhoto(evidenceId)}
              onRetrySync={() => void reportActions.retrySync()}
              onReviewNotesChange={onReportReviewNotesChange}
              onSaveDraft={() => void reportActions.saveDraft()}
              onSubmitReport={() => void reportActions.submitReport()}
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
    </SafeAreaView>
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
  password,
  reviewAccess,
  reviewBusy,
  reviewQueueCount,
  searchQuery,
  session,
  shellMessage,
  visibleTags,
  onEmailChange,
  onFilterChange,
  onOpenDetail,
  onPasswordChange,
  onBarcodeScanned,
  onCancelQrScanner,
  onQrManualPayloadChange,
  onOpenReview,
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
  password: string;
  reviewAccess: ReturnType<typeof buildVisualReviewAccess>;
  reviewBusy: boolean;
  reviewQueueCount: number;
  searchQuery: string;
  session: ActiveUserSession | null;
  shellMessage: string | null;
  visibleTags: VisualTagSummary[];
  onEmailChange: (value: string) => void;
  onFilterChange: (value: VisualTagCategory | 'all') => void;
  onOpenDetail: (tag: VisualTagSummary) => void;
  onPasswordChange: (value: string) => void;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
  onCancelQrScanner: () => void;
  onQrManualPayloadChange: (value: string) => void;
  onOpenReview: () => void;
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
  return (
    <>
      <View style={styles.dashboardHeader}>
        <View>
          <TagWiseLogo large />
          <Text style={styles.headerSubtitle}>Calculo, diagnostico e evidencia por tag</Text>
        </View>
        <View style={styles.headerIconRow}>
          <IconBubble label="☁" />
          <IconBubble label="●" badge />
        </View>
      </View>

      <View style={styles.searchGrid}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={onSearchChange}
            placeholder="Buscar tag, ativo ou area..."
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            value={searchQuery}
          />
          <Text style={styles.microphoneIcon}>▮</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onStartQrScanner} style={styles.qrButton}>
          <Text style={styles.qrIcon}>▦</Text>
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

      <SectionHeader actionLabel="Ver todas" icon="◷" title="Abertas recentemente" />
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

      {reviewAccess.state === 'available' || reviewAccess.state === 'connected-required' ? (
        <ReviewAccessCard
          access={reviewAccess}
          busy={reviewBusy}
          queueCount={reviewQueueCount}
          onOpenReview={onOpenReview}
        />
      ) : null}

      {session && model.source === 'local-empty' ? (
        <EmptyCatalogState onRefreshPackages={onRefreshPackages} packageBusy={packageBusy} />
      ) : null}

      <TagSection
        accentColor="#ff8b49"
        actionLabel={activeFilter === 'pending' ? undefined : 'Ver todas'}
        tags={visibleTags.filter((tag) => tag.category === 'pending')}
        title="Pendentes"
        totalLabel={`(${model.counts.pending})`}
        onOpenDetail={onOpenDetail}
      />
      <TagSection
        accentColor={colors.red}
        actionLabel={activeFilter === 'recurrent' ? undefined : 'Ver todas'}
        tags={visibleTags.filter((tag) => tag.category === 'recurrent')}
        title="Reincidentes"
        totalLabel={`(${model.counts.recurrent})`}
        onOpenDetail={onOpenDetail}
      />
      <TagSection
        accentColor={colors.amber}
        actionLabel={activeFilter === 'due' ? undefined : 'Ver todas'}
        tags={visibleTags.filter((tag) => tag.category === 'due')}
        title="Vencendo"
        totalLabel={`(${model.counts.due})`}
        onOpenDetail={onOpenDetail}
      />
    </>
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
          value={selectedTagContext?.dueIndicator.value ?? 'Demo visual'}
        />
      </View>

      <View style={styles.twoColumnRow}>
        <InfoPill icon="!" label={selectedTagContext?.historyPreview.title ?? 'Historico demo'} />
        <InfoPill icon="▣" label="Vence em 12 dias" warning />
      </View>

      <View style={styles.sectionBand}>
        <SectionHeader actionLabel="Ver todas" icon="◷" title="Pendentes (12)" />
        {templates.length > 0 ? (
          templates.map((template) => {
            const selected = template.id === selectedExecutionTemplateId;
            return (
              <Pressable
                accessibilityRole="button"
                key={template.id}
                onPress={() => onSelectExecutionTemplate(template.id)}
                style={[styles.templateRow, selected ? styles.templateRowSelected : null]}
              >
                <View style={styles.flexOne}>
                  <Text style={styles.templateTitle}>{template.title}</Text>
                  <Text style={styles.templateBody}>{template.testPattern}</Text>
                </View>
                <StatusPill
                  label={selected ? 'Selecionado' : 'Escolher'}
                  severity={selected ? 'ok' : 'medium'}
                />
              </Pressable>
            );
          })
        ) : (
          <InlineMessage text="Nenhum template local disponivel para esta tag." />
        )}
        <TagListItem tag={selectedTag} onPress={() => onOpenCalculation()} />
        <View style={styles.resultGrid}>
          <Pressable accessibilityRole="button" onPress={onOpenCalculation} style={styles.resultTile}>
            <Text style={styles.resultIcon}>✓</Text>
            <Text style={styles.resultTitle}>{selectedExecutionTemplateId ? 'Pronto' : 'Template'}</Text>
            <Text style={styles.resultSubtitle}>
              {selectedExecutionTemplateId ? 'selecionado' : 'necessario'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenHistory} style={styles.resultTile}>
            <Text style={styles.resultIcon}>▥</Text>
            <Text style={styles.resultTitle}>{selectedTagContext?.historyPreview.lastResult ?? 'Historico'}</Text>
            <Text style={styles.resultSubtitle}>{selectedTagContext?.historyPreview.state ?? 'demo'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actionGrid}>
        <ActionTile active icon="▦" label="Calcular" onPress={onOpenCalculation} />
        <ActionTile icon="⇄" label="Comparar" onPress={onOpenHistory} />
        <ActionTile highlight icon="⌁" label="Diagnosticar" onPress={onOpenDiagnosis} />
        <ActionTile icon="▤" label="Registrar" onPress={onOpenReport} />
      </View>
    </>
  );
}

function ServiceCalculationScreen({
  calculation,
  selectedTag,
  shellMessage,
  onBack,
  onInputChange,
  onSaveCalculation,
}: {
  calculation: VisualExecutionCalculationViewModel;
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  onBack: () => void;
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
      <Text style={styles.tagHeroTitle}>{calculation.tagCode || selectedTag.code}</Text>
      <Text style={styles.tagHeroSubtitle}>{calculation.templateTitle}</Text>

      <View style={styles.selectBox}>
        <Text style={styles.selectText}>{calculation.modeLabel}</Text>
        <StatusPill
          label={calculation.result?.acceptanceLabel ?? 'PENDING'}
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
        <ExecutionMetric label="Unit" value={calculation.unitLabel} />
        <ExecutionMetric label="Range" value={calculation.rangeLabel} />
        <ExecutionMetric label="Tolerance" value={calculation.toleranceLabel} />
        <ExecutionMetric label="Acceptance" value={calculation.acceptanceLabel} />
        <ExecutionMetric label="Conversion basis" value={calculation.conversionBasisLabel} />
        <ExecutionMetric label="Expected range" value={calculation.expectedRangeLabel} />
      </View>

      <View style={styles.failureBar}>
        <Text style={styles.failureBarText}>
          {calculation.result
            ? `Error: ${calculation.result.absoluteDeviationLabel}`
            : 'Enter values and save to calculate locally'}
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
            Signed deviation: {calculation.result.signedDeviationLabel}
          </Text>
          <Text style={styles.pendingText}>
            Percent of span: {calculation.result.percentOfSpanLabel}
          </Text>
          <Text style={styles.pendingText}>Saved: {calculation.updatedAtLabel}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!calculation.editable}
        onPress={onSaveCalculation}
        style={[styles.fullWidthPrimary, !calculation.editable ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Save deterministic calculation</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Offline conversion</Text>
      <Text style={styles.pendingText}>{calculation.conversion.reason}</Text>
      <TextInput
        keyboardType="numeric"
        onChangeText={setConversionValue}
        placeholder="Value to convert"
        placeholderTextColor={colors.textSubtle}
        style={styles.darkInput}
        value={conversionValue}
      />
      <View style={styles.conversionGrid}>
        <ConversionButton label="PV to mA" onPress={() => handleConvert('process-to-milliamp')} />
        <ConversionButton label="mA to PV" onPress={() => handleConvert('milliamp-to-process')} />
        <ConversionButton label="mA to %" onPress={() => handleConvert('milliamp-to-percent')} />
        <ConversionButton label="% to mA" onPress={() => handleConvert('percent-to-milliamp')} />
      </View>
      {conversionResult ? (
        <View style={styles.conversionResultCard}>
          <Text style={styles.historyTitle}>{conversionResult.label}</Text>
          <Text style={styles.pendingText}>{conversionResult.detail}</Text>
        </View>
      ) : null}
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
  history,
  selectedTag,
  shellMessage,
  onBack,
  onOpenDiagnosis,
}: {
  history: VisualExecutionHistoryViewModel;
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  onBack: () => void;
  onOpenDiagnosis: () => void;
}) {
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
            <Text style={styles.chartTitle}>Current comparison</Text>
            <Text style={styles.currentComparisonValue}>{history.currentResultLabel}</Text>
          </View>
          <StatusPill
            label={history.currentResultSeverity === 'high' ? 'FAIL' : 'LOCAL'}
            severity={history.currentResultSeverity}
          />
        </View>
        <Text style={styles.pendingText}>{history.summary}</Text>
        <Text style={styles.pendingText}>{history.detail}</Text>
      </View>

      <SectionHeader icon="H" title="Cached history fields" />
      {history.rows.length > 0 ? (
        history.rows.map((row) => (
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
        <InlineMessage text="No local history rows were cached for this selected tag." />
      )}

      <Pressable accessibilityRole="button" onPress={onOpenDiagnosis} style={styles.fullWidthPrimary}>
        <Text style={styles.fullWidthPrimaryIcon}>G</Text>
        <Text style={styles.fullWidthPrimaryLabel}>Open local guidance</Text>
      </Pressable>
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
  selectedTag,
  shellMessage,
  onBack,
  onChecklistOutcomeChange,
  onObservationNotesChange,
  onOpenReport,
  onRiskJustificationChange,
  onSaveGuidanceEvidence,
}: {
  guidance: VisualExecutionGuidanceViewModel;
  selectedTag: VisualTagSummary;
  shellMessage: string | null;
  onBack: () => void;
  onChecklistOutcomeChange: (
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ) => void;
  onObservationNotesChange: (value: string) => void;
  onOpenReport: () => void;
  onRiskJustificationChange: (riskItemId: string, justificationText: string) => void;
  onSaveGuidanceEvidence: () => void;
}) {
  const nextStep =
    guidance.guidedDiagnosisPrompts[0]?.prompt ??
    guidance.checklistItems[0]?.prompt ??
    'No local next-step guidance was cached for this selected template.';

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
      <Text style={styles.tagHeroTitle}>{guidance.tagCode || selectedTag.code}</Text>
      <Text style={styles.tagHeroSubtitle}>{guidance.title}</Text>

      <View style={styles.executionMetricGrid}>
        <ExecutionMetric label="Risk state" value={guidance.riskStateLabel} />
        <ExecutionMetric label="Submit readiness" value={guidance.submitReadinessLabel} />
        <ExecutionMetric label="Last guidance save" value={guidance.guidanceEvidenceSavedAtLabel} />
      </View>

      <Text style={styles.kicker}>NEXT STEP</Text>
      <View style={styles.nextStepCard}>
        <Text style={styles.nextStepIcon}>N</Text>
        <Text style={styles.nextStepText}>{nextStep}</Text>
      </View>

      <View style={styles.whyBlock}>
        <Text style={styles.whyTitle}>Local guidance summary</Text>
        <Text style={styles.whyBody}>{guidance.summary}</Text>
        <Text style={styles.whyBody}>{guidance.detail}</Text>
      </View>

      <View style={styles.checklistBlock}>
        <Text style={styles.sectionTitle}>Technical checklist</Text>
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
          <InlineMessage text="No checklist steps were cached for this selected template. Continue with observation notes if needed." />
        )}
      </View>

      <Text style={styles.sectionTitle}>Observation notes</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={guidance.editable}
        multiline
        onChangeText={onObservationNotesChange}
        placeholder="Capture field observations for this local execution."
        placeholderTextColor={colors.textSubtle}
        style={[styles.justificationInput, !guidance.editable ? styles.disabledAction : null]}
        value={guidance.observationNotes}
      />

      <Text style={styles.sectionTitle}>Visible risks</Text>
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
        <InlineMessage text="No visible risk is currently flagged by local history, context, checklist, or evidence state." />
      )}

      <Text style={styles.sectionTitle}>Guided prompts</Text>
      {guidance.guidedDiagnosisPrompts.length > 0 ? (
        guidance.guidedDiagnosisPrompts.map((item) => (
          <GuidancePromptView key={item.id} item={item} title="Deterministic prompt" />
        ))
      ) : (
        <InlineMessage text="No guided diagnosis prompts were cached for this selected template." />
      )}

      <Text style={styles.sectionTitle}>Best practices and references</Text>
      {guidance.linkedGuidance.length > 0 ? (
        guidance.linkedGuidance.map((item) => (
          <LinkedGuidanceView key={item.id} item={item} />
        ))
      ) : (
        <InlineMessage text="No best-practice or normative reference snippets were cached for this selected tag." />
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!guidance.editable}
        onPress={onSaveGuidanceEvidence}
        style={[styles.fullWidthPrimary, !guidance.editable ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Save checklist and notes</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={onOpenReport} style={styles.secondaryFullWidth}>
        <Text style={styles.returnLabel}>Continue to report draft</Text>
      </Pressable>
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
  shellMessage,
  syncBusy,
  onAttachCamera,
  onAttachLibrary,
  onBack,
  onRefreshServerStatus,
  onRemovePhoto,
  onRetrySync,
  onReviewNotesChange,
  onSaveDraft,
  onSubmitReport,
}: {
  report: VisualReportProjection;
  shellMessage: string | null;
  syncBusy: boolean;
  onAttachCamera: () => void;
  onAttachLibrary: () => void;
  onBack: () => void;
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
        title="Report draft unavailable"
        unavailableReason={report.unavailableReason}
        onBack={onBack}
      />
    );
  }

  return (
    <>
      <ScreenHeader onBack={onBack} />
      {shellMessage ? <InlineMessage text={shellMessage} /> : null}
      <Text style={styles.screenTitle}>Report</Text>

      <View style={styles.summaryCard}>
        <SummaryLine label="Tag" value={report.tagCode} />
        <SummaryLine label="Template" value={report.templateTitle} />
        <SummaryLine label="Lifecycle" value={report.lifecycleStateLabel} pill />
        <SummaryLine label="Owner" value={report.reportStateLabel} />
        <SummaryLine label="Sync" value={`${report.syncBadge.label}: ${report.syncBadge.detail}`} />
      </View>

      <Text style={styles.sectionTitle}>Automatic Summary</Text>
      <View style={styles.summaryCard}>
        {report.summaryRows.map((row) => (
          <SummaryLine key={row.label} label={row.label} value={row.value} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Checklist Outcomes</Text>
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
            No checklist outcomes have been captured for this local report draft yet.
          </Text>
        </View>
      )}

      <SectionHeader
        actionLabel={`${report.photoAttachments.length} local photos`}
        title="Evidence"
      />
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
          <Text style={styles.smallGhostLabel}>Library</Text>
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
                <Text style={styles.pendingText}>{attachment.syncIssue}</Text>
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
                <Text style={styles.smallGhostLabel}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            No photo evidence has been attached locally for this report yet.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Risk and Justification</Text>
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
              Justification: {riskFlag.justificationText.trim() || 'Not captured'}
            </Text>
          </View>
        ))
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>No local risk flags are active for this report.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Technician Review Notes</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={report.editable}
        multiline
        onChangeText={onReviewNotesChange}
        placeholder="Add final notes, corrections, or observations for report review..."
        placeholderTextColor={colors.textSubtle}
        style={[styles.justificationInput, !report.editable ? styles.disabledAction : null]}
        value={report.reviewNotes}
      />

      <View style={styles.guidanceCard}>
        <Text style={styles.historySubtitle}>Report intelligence</Text>
        <Text style={styles.historyTitle}>AI Diagnosis</Text>
        <Text style={styles.pendingText}>{report.aiDiagnosis.label}</Text>
        <Text style={styles.pendingText}>{report.aiDiagnosis.detail}</Text>
        {report.aiDiagnosis.summary ? (
          <Text style={styles.pendingText}>{report.aiDiagnosis.summary}</Text>
        ) : null}
        {report.aiDiagnosis.generatedAtLabel ? (
          <Text style={styles.historySubtitle}>
            Generated: {report.aiDiagnosis.generatedAtLabel}
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Sync</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>{report.syncBadge.label}</Text>
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
          <Text style={styles.smallActionLabel}>Retry Sync</Text>
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
          <Text style={styles.smallGhostLabel}>Refresh Status</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!report.canSaveDraft}
        onPress={onSaveDraft}
        style={[styles.secondaryFullWidth, !report.canSaveDraft ? styles.disabledAction : null]}
      >
        <Text style={styles.returnLabel}>Save Report Draft</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!report.canSubmit}
        onPress={onSubmitReport}
        style={[styles.fullWidthPrimary, !report.canSubmit ? styles.disabledAction : null]}
      >
        <Text style={styles.fullWidthPrimaryLabel}>Submit to Local Queue</Text>
      </Pressable>
      {!report.canSubmit ? (
        <Text style={styles.qrGuidanceText}>{report.submitReadinessLabel}</Text>
      ) : null}
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
      <Text style={styles.screenTitle}>Review</Text>

      <View style={styles.summaryCard}>
        <SummaryLine label="Access" value={access.label} pill={access.state === 'available'} />
        <SummaryLine label="Role" value={access.reviewerRole ?? 'None'} />
        <SummaryLine label="State" value={access.state} />
        <SummaryLine label="Authority" value={access.canUseDecisionActions ? 'Connected' : 'Unavailable'} />
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
              {busy ? 'Loading review queue...' : 'Refresh service queue'}
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
                count={group.items.length}
                key={group.key}
                label={group.label}
                onPress={() => onGroupChange(group.key)}
              />
            ))}
          </ScrollView>

          <SectionHeader title={`${activeGroup.label} Queue`} />
          {activeGroup.items.length === 0 ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingText}>{activeGroup.emptyLabel}</Text>
            </View>
          ) : (
            activeGroup.items.map((item) => (
              <View key={item.reportId} style={styles.guidanceCard}>
                <Text style={styles.historyTitle}>{item.tagId}</Text>
                <Text style={styles.historySubtitle}>{item.reportId}</Text>
                <SummaryLine label="Lifecycle" value={item.statusLabel} />
                <SummaryLine label="Work package" value={item.workPackageId} />
                <SummaryLine label="Risk flags" value={`${item.riskFlagCount}`} />
                <SummaryLine label="Pending evidence" value={`${item.pendingEvidenceCount}`} />
                <Text style={styles.pendingText}>{item.executionSummary}</Text>
                <Text style={styles.pendingText}>Accepted: {item.acceptedAtLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onOpenReport(item.reportId)}
                  style={[styles.smallActionButton, busy ? styles.disabledAction : null]}
                >
                  <Text style={styles.smallActionLabel}>Open service detail</Text>
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
        <SummaryLine label="Lifecycle" value={detail.lifecycleStateLabel} pill />
        <SummaryLine label="Sync" value={detail.syncStateLabel} />
        {detail.summaryRows.map((row) => (
          <SummaryLine key={row.label} label={row.label} value={row.value} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Evidence Status</Text>
      <View style={styles.pendingCard}>
        {detail.evidenceStatusRows.map((row) => (
          <Text key={row.label} style={styles.pendingText}>
            {row.label}: {row.value}
          </Text>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Evidence References</Text>
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
              {reference.requirementLevel.toUpperCase()} - {reference.stateLabel}
            </Text>
            <Text style={styles.pendingText}>{reference.detail}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>No evidence references were returned by the service.</Text>
      )}

      <Text style={styles.sectionTitle}>Photo Evidence</Text>
      {detail.photoAttachments.length > 0 ? (
        detail.photoAttachments.map((photo) => (
          <View key={photo.evidenceId} style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>{photo.evidenceId}</Text>
            <Text style={styles.pendingText}>Server evidence: {photo.serverEvidenceId ?? 'None'}</Text>
            <Text style={styles.pendingText}>Sync: {photo.syncState}</Text>
            <Text style={styles.pendingText}>Finalized: {photo.finalizedLabel}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>No photo attachments are linked to this review detail.</Text>
      )}

      <Text style={styles.sectionTitle}>Risk and Justification</Text>
      {detail.riskFlags.length > 0 ? (
        detail.riskFlags.map((risk) => (
          <View key={risk.id} style={styles.guidanceCard}>
            <Text style={styles.historyTitle}>{risk.reasonType}</Text>
            <Text style={styles.pendingText}>{risk.stateLabel}</Text>
            <Text style={styles.pendingText}>Justification: {risk.justificationLabel}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>No risk flags were returned by the service.</Text>
      )}

      <Text style={styles.sectionTitle}>AI Diagnosis</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>{detail.aiDiagnosis.label}</Text>
        <Text style={styles.pendingText}>{detail.aiDiagnosis.detail}</Text>
        {detail.aiDiagnosis.summary ? (
          <Text style={styles.pendingText}>{detail.aiDiagnosis.summary}</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Approval History</Text>
      {detail.approvalHistory.items.length > 0 ? (
        detail.approvalHistory.items.map((item) => (
          <View key={item.auditEventId} style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>{item.actionType}</Text>
            <Text style={styles.pendingText}>Actor role: {item.actorRole}</Text>
            <Text style={styles.pendingText}>At: {item.occurredAtLabel}</Text>
            <Text style={styles.pendingText}>State: {item.stateTransitionLabel}</Text>
            <Text style={styles.pendingText}>Correlation: {item.correlationId}</Text>
            {item.comment ? <Text style={styles.pendingText}>Comment: {item.comment}</Text> : null}
          </View>
        ))
      ) : (
        <Text style={styles.pendingText}>{detail.approvalHistory.placeholder}</Text>
      )}

      <Text style={styles.sectionTitle}>Decision Comment</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        editable={detail.canReturn && !busy}
        multiline
        onChangeText={onReturnCommentChange}
        placeholder="Required return comment"
        placeholderTextColor={colors.textSubtle}
        style={[styles.justificationInput, !detail.canReturn || busy ? styles.disabledAction : null]}
        value={returnComment}
      />
      {detail.canEscalate ? (
        <>
          <Text style={styles.sectionTitle}>Escalation Rationale</Text>
          <TextInput
            autoCapitalize="sentences"
            autoCorrect
            editable={detail.canEscalate && !busy}
            multiline
            onChangeText={onEscalationRationaleChange}
            placeholder="Required escalation rationale"
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
              : 'Decision blocked'}
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
                <Text style={styles.smallGhostLabel}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onCancelDecision}
              style={styles.smallGhostButton}
            >
              <Text style={styles.smallGhostLabel}>Dismiss</Text>
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
          <Text style={styles.smallActionLabel}>Approve</Text>
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
          <Text style={styles.smallGhostLabel}>Return</Text>
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
            <Text style={styles.smallGhostLabel}>Escalate</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onCloseReport} style={styles.secondaryFullWidth}>
        <Text style={styles.returnLabel}>Back to queue</Text>
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

function TagWiseLogo({ large = false }: { large?: boolean }) {
  return (
    <Text style={[styles.logo, large ? styles.logoLarge : null]}>
      Tag<Text style={styles.logoAccent}>Wise</Text><Text style={styles.logoMark}>⌜</Text>
    </Text>
  );
}

function ScreenHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonLabel}>‹</Text>
      </Pressable>
      <TagWiseLogo />
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
            'Local execution data is unavailable. The technician can return to the tag detail and continue from cached context.'}
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
      <Text style={styles.pendingText}>Why it matters: {item.whyItMatters}</Text>
      <Text style={styles.pendingText}>Helps rule out: {item.helpsRuleOut}</Text>
      <Text style={styles.pendingText}>Source: {item.sourceReference}</Text>

      <View style={styles.outcomeGrid}>
        <GuidanceOutcomeButton
          active={item.outcome === 'completed'}
          disabled={!editable}
          label="Complete"
          onPress={() => onChecklistOutcomeChange(item.id, 'completed')}
        />
        <GuidanceOutcomeButton
          active={item.outcome === 'incomplete'}
          disabled={!editable}
          label="Incomplete"
          onPress={() => onChecklistOutcomeChange(item.id, 'incomplete')}
        />
        <GuidanceOutcomeButton
          active={item.outcome === 'skipped'}
          disabled={!editable}
          label="Skip"
          onPress={() => onChecklistOutcomeChange(item.id, 'skipped')}
        />
        <GuidanceOutcomeButton
          active={item.outcome === 'pending'}
          disabled={!editable}
          label="Reset"
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
            {item.justificationPrompt ?? 'Capture a field justification for this visible risk.'}
          </Text>
          <TextInput
            autoCapitalize="sentences"
            autoCorrect
            editable={editable}
            multiline
            onChangeText={onJustificationChange}
            placeholder="Risk justification"
            placeholderTextColor={colors.textSubtle}
            style={[styles.justificationInput, !editable ? styles.disabledAction : null]}
            value={item.justificationText}
          />
        </>
      ) : (
        <Text style={styles.pendingText}>
          This risk should be resolved before submission, but it does not block field execution here.
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
      <Text style={styles.pendingText}>Why it matters: {item.whyItMatters}</Text>
      <Text style={styles.pendingText}>Helps rule out: {item.helpsRuleOut}</Text>
      <Text style={styles.pendingText}>Source: {item.sourceReference}</Text>
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
      <Text style={styles.historySubtitle}>Local reference</Text>
      <Text style={styles.historyTitle}>{item.title}</Text>
      <Text style={styles.pendingText}>{item.summary}</Text>
      <Text style={styles.pendingText}>Why it matters: {item.whyItMatters}</Text>
      <Text style={styles.pendingText}>Source: {item.sourceReference}</Text>
    </View>
  );
}

function IconBubble({ badge = false, label }: { badge?: boolean; label: string }) {
  return (
    <View style={styles.iconBubble}>
      <Text style={styles.iconBubbleLabel}>{label}</Text>
      {badge ? <View style={styles.iconBadge} /> : null}
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
  count: number;
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
      <Text style={[styles.filterChipCount, active ? styles.filterChipCountActive : null]}>
        {count}
      </Text>
    </Pressable>
  );
}

function SectionHeader({
  actionLabel,
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
      {actionLabel ? <Text style={styles.sectionAction}>{actionLabel} ›</Text> : null}
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
  actionLabel,
  tags,
  title,
  totalLabel,
  onOpenDetail,
}: {
  accentColor: string;
  actionLabel?: string;
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
        <SectionHeader actionLabel={actionLabel} title={`${title} ${totalLabel}`} />
        {tags.map((tag) => (
          <TagListItem key={`${tag.workPackageId}:${tag.id}`} tag={tag} onPress={onOpenDetail} />
        ))}
      </View>
    </View>
  );
}

function TagListItem({
  tag,
  onPress,
}: {
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
        <StatusPill label={tag.badgeLabel} severity={tag.severity} />
        <Text style={styles.tagListArea}>{tag.badgeDetail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
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
      return 'Completed';
    case 'incomplete':
      return 'Incomplete';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Pending';
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
    return '◷';
  }
  return '✓';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 48,
    backgroundColor: colors.background,
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
    gap: spacing.sm,
    marginTop: spacing.md,
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
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 22,
    flex: 1,
  },
  metricLineValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
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
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionTile: {
    width: 124,
    minHeight: 112,
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
    fontSize: 34,
    fontWeight: '900',
  },
  actionIconHighlight: {
    color: colors.amber,
  },
  actionLabel: {
    color: colors.text,
    fontSize: 19,
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
    height: 160,
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
