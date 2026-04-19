import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { AssignedWorkPackageCatalogService } from '../features/work-packages/assignedWorkPackageCatalogService';
import type { LocalAssignedWorkPackageSummary } from '../features/work-packages/model';
import { createFetchAssignedWorkPackageApiClient } from '../features/work-packages/workPackageApiClient';
import { createSecureStorageBoundary } from '../platform/secure-storage/secureStorageBoundary';
import { closeRuntimeIfInactive } from './runtimeCleanup';

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
      session: ActiveUserSession | null;
      localOwnership: LocalOwnershipProofSnapshot | null;
      authBusy: boolean;
      packageBusy: boolean;
      authMessage: string | null;
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
          session,
          localOwnership,
          authBusy: false,
          packageBusy: false,
          authMessage:
            restoredSession.state === 'signed_in' && session?.connectionMode === 'offline'
              ? 'Offline session restored from cached role metadata.'
              : null,
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
              authMessage: `Assigned package ${result.snapshot.summary.id} downloaded to local SQLite.`,
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
            authMessage:
              result.state === 'cleared'
                ? 'Session cleared. Connected sign-in is required for the next user.'
                : result.message ?? 'User switch blocked.',
          },
    );
  }

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

                {readyState.workPackages.length === 0 ? (
                  <Text style={styles.helperText}>
                    No assigned packages are cached on this device yet. Refresh while connected to
                    load your bounded working set.
                  </Text>
                ) : null}

                {readyState.workPackages.map((workPackage) => (
                  <View key={workPackage.id} style={styles.listCard}>
                    <Text style={styles.listCardTitle}>{workPackage.title}</Text>
                    <Text style={styles.helperText}>
                      {workPackage.id} · {workPackage.sourceReference}
                    </Text>

                    <View style={styles.metricGrid}>
                      <MetricCard label="Priority" value={workPackage.priority} />
                      <MetricCard label="Tags" value={String(workPackage.tagCount)} />
                    </View>

                    <View style={styles.metricGrid}>
                      <MetricCard
                        label="Due"
                        value={formatDueWindow(workPackage.dueWindow.endsAt)}
                      />
                      <MetricCard
                        label="Downloaded"
                        value={
                          workPackage.downloadedAt
                            ? formatTimestamp(workPackage.downloadedAt)
                            : 'Not yet'
                        }
                      />
                    </View>

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
                        {workPackage.hasSnapshot ? 'Redownload snapshot' : 'Download snapshot'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
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

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatDueWindow(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return formatTimestamp(value);
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
  listCard: {
    backgroundColor: '#f8faf9',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5ece8',
  },
  listCardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
});
