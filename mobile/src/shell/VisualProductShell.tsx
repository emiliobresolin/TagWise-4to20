import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ActiveUserSession } from '../features/auth/model';
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
import type {
  LocalAssignedTagEntry,
  LocalAssignedWorkPackageSummary,
  LocalTagContext,
} from '../features/work-packages/model';
import type { LocalQrScanResult } from '../features/work-packages/localQrScanService';

type VisualRoute = 'dashboard' | 'detail' | 'calculation' | 'history' | 'diagnosis' | 'report' | 'approval';

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
  onProceedToExecutionShell: () => Promise<void>;
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
}: VisualProductShellProps) {
  const [route, setRoute] = useState<VisualRoute>('dashboard');
  const [activeFilter, setActiveFilter] = useState<VisualTagCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDemoTag, setSelectedDemoTag] = useState<VisualTagSummary | null>(null);
  const [selectedSymptom, setSelectedSymptom] = useState('Sem Resposta');
  const [justification, setJustification] = useState('');
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
    if (selectedExecutionTemplateId) {
      await onProceedToExecutionShell();
    }
    openRoute(nextRoute);
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
        ) : !selectedTag ? (
          <NoSelectedTagScreen onBack={() => openRoute('dashboard')} />
        ) : route === 'calculation' ? (
          <CalculationScreen
            calculation={model.calculation}
            selectedTag={selectedTag}
            onBack={() => openRoute('detail')}
          />
        ) : route === 'history' ? (
          <HistoryScreen
            history={model.history}
            selectedTag={selectedTag}
            onBack={() => openRoute('detail')}
            onOpenDiagnosis={() => openRoute('diagnosis')}
          />
        ) : route === 'diagnosis' ? (
          <DiagnosisScreen
            diagnosis={{
              ...model.diagnosis,
              selectedSymptom,
            }}
            onBack={() => openRoute('detail')}
            onOpenReport={() => openRoute('report')}
            onSelectSymptom={setSelectedSymptom}
          />
        ) : route === 'report' ? (
          <ReportScreen
            justification={justification}
            report={model.report}
            onBack={() => openRoute('diagnosis')}
            onJustificationChange={setJustification}
            onOpenApproval={() => openRoute('approval')}
          />
        ) : (
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

function CalculationScreen({
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

function HistoryScreen({
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

function DiagnosisScreen({
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

function ReportScreen({
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
  returnLabel: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '900',
  },
});
