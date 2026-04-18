import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { bootstrapLocalDatabase, type LocalRuntime } from '../data/local/bootstrapLocalDatabase';
import {
  DEFAULT_SHELL_ROUTE,
  type BootstrapDemoRecord,
  type DatabaseMigrationSummary,
  type ShellRoute,
} from '../features/app-shell/model';
import { closeRuntimeIfInactive } from './runtimeCleanup';

type BootstrapStatus =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | {
      type: 'ready';
      runtime: LocalRuntime;
      route: ShellRoute;
      demoRecord: BootstrapDemoRecord;
      migrationSummary: DatabaseMigrationSummary;
      databaseName: string;
    };

const placeholderRoutes = [
  { key: 'foundation' as const, label: 'Foundation' },
  { key: 'storage' as const, label: 'Storage' },
];

export function TagWiseApp() {
  const [status, setStatus] = useState<BootstrapStatus>({ type: 'loading' });

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

        setStatus({
          type: 'ready',
          runtime,
          route: runtime.snapshot.shellRoute,
          demoRecord: runtime.snapshot.demoRecord,
          migrationSummary: runtime.snapshot.migrationSummary,
          databaseName: runtime.snapshot.databaseName,
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.badge}>Signed-out local shell</Text>
          <Text style={styles.heroTitle}>TagWise mobile foundation</Text>
          <Text style={styles.heroBody}>
            This story intentionally proves only the local-first mobile shell: no live API,
            no sync engine, and no auth workflow yet.
          </Text>
        </View>

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
              Expected behavior: this counter updates instantly and remains after app restart.
            </Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Local storage diagnostics</Text>
            <Text style={styles.panelBody}>
              This placeholder view exists only to validate shell state persistence and the SQLite
              bootstrap path.
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

            <Text style={styles.helperText}>
              Future stories will add auth/session continuation, work-package preload, tag context,
              execution/report flows, and sync queueing on top of this local-first shell.
            </Text>
          </View>
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
  primaryButtonLabel: {
    color: '#f8fafc',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
  },
});
