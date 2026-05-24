import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ActiveUserSession } from '../auth/model';
import { SupervisorAuthoringApiError } from './supervisorAuthoringApiClient';
import {
  SupervisorAuthoringValidationError,
  validateCreateWorkPackageInput,
  type SupervisorAuthoringService,
} from './supervisorAuthoringService';
import {
  SUPERVISOR_AUTHORING_FAMILY_LABEL_PT_BR,
  type CatalogInstrument,
  type CatalogInstrumentFamily,
  type CatalogTechnician,
  type CreateWorkPackageInput,
  type SupervisorWorkPackagePriority,
} from './model';

type Step = 'instruments' | 'metadata' | 'confirm';

export interface SupervisorAuthoringScreenProps {
  service: SupervisorAuthoringService;
  session: ActiveUserSession;
  onClose: () => void;
  onCreated: (result: { workPackageId: string; title: string; tagCount: number }) => void;
}

const TEN_DAYS_MS = 1000 * 60 * 60 * 24 * 10;

function defaultStartIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndIso(): string {
  return new Date(Date.now() + TEN_DAYS_MS).toISOString().slice(0, 10);
}

function dateToServerIso(date: string): string | null {
  if (!date) {
    return null;
  }
  return `${date}T00:00:00.000Z`;
}

export function SupervisorAuthoringScreen(props: SupervisorAuthoringScreenProps) {
  const { service, session, onClose, onCreated } = props;

  const [step, setStep] = useState<Step>('instruments');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [instruments, setInstruments] = useState<CatalogInstrument[]>([]);
  const [technicians, setTechnicians] = useState<CatalogTechnician[]>([]);

  const [selectedInstrumentIds, setSelectedInstrumentIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('Instrumentation Alpha');
  const [priority, setPriority] = useState<SupervisorWorkPackagePriority>('routine');
  const [startsAtIso, setStartsAtIso] = useState(defaultStartIso());
  const [endsAtIso, setEndsAtIso] = useState(defaultEndIso());
  const [assignedUserId, setAssignedUserId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const { instruments: i, technicians: t } = await service.loadCatalog(session);
        if (cancelled) return;
        setInstruments(i);
        setTechnicians(t);
        if (t.length > 0 && !assignedUserId) {
          setAssignedUserId(t[0].id);
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(formatError(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => groupInstruments(instruments), [instruments]);
  const selectedCount = selectedInstrumentIds.length;
  const suggestedTitle = useMemo(() => {
    if (title.trim().length > 0) return title;
    if (selectedCount === 0) return '';
    const primaryFamily = familyOfFirstSelected(instruments, selectedInstrumentIds);
    const familyLabel = primaryFamily
      ? SUPERVISOR_AUTHORING_FAMILY_LABEL_PT_BR[primaryFamily]
      : 'Instrumentos';
    return `${familyLabel} - ${selectedCount} instrumento(s)`;
  }, [title, instruments, selectedInstrumentIds, selectedCount]);

  const toggleInstrument = (id: string) => {
    setSelectedInstrumentIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const handleNextFromInstruments = () => {
    if (selectedCount === 0) return;
    if (!title) setTitle(suggestedTitle);
    setStep('metadata');
  };

  const handleNextFromMetadata = () => {
    setErrorMessage(null);
    try {
      const input = buildInput();
      // dry-run validation so the user sees feedback before final submit
      buildInputAndValidate(input);
      setStep('confirm');
    } catch (error) {
      setErrorMessage(formatError(error));
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const input = buildInput();
      const result = await service.submitNewPackage(session, input);
      onCreated(result);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setSubmitting(false);
    }
  };

  function buildInput(): CreateWorkPackageInput {
    return {
      title: title.trim().length > 0 ? title.trim() : suggestedTitle,
      assignedTeam,
      priority,
      dueWindow: {
        startsAt: dateToServerIso(startsAtIso),
        endsAt: dateToServerIso(endsAtIso),
      },
      assignedUserId,
      instrumentIds: selectedInstrumentIds,
    };
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Criar pacote de trabalho</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={styles.headerCloseButton}
        >
          <Text style={styles.headerCloseLabel}>Fechar</Text>
        </Pressable>
      </View>

      <View style={styles.stepperRow}>
        <StepIndicator label="1. Instrumentos" active={step === 'instruments'} done={step !== 'instruments'} />
        <StepIndicator label="2. Detalhes" active={step === 'metadata'} done={step === 'confirm'} />
        <StepIndicator label="3. Confirmar" active={step === 'confirm'} done={false} />
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color="#9bd1ff" />
          <Text style={styles.loadingText}>Carregando catalogo...</Text>
        </View>
      ) : null}

      {!loading && step === 'instruments' ? (
        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollBodyContent}>
          {grouped.map((group) => (
            <View key={group.family} style={styles.familyBlock}>
              <Text style={styles.familyHeader}>
                {SUPERVISOR_AUTHORING_FAMILY_LABEL_PT_BR[group.family]}
              </Text>
              {group.items.map((instrument) => {
                const selected = selectedInstrumentIds.includes(instrument.id);
                return (
                  <Pressable
                    key={instrument.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ selected }}
                    onPress={() => toggleInstrument(instrument.id)}
                    style={[styles.instrumentRow, selected ? styles.instrumentRowSelected : null]}
                  >
                    <View style={styles.instrumentRowMain}>
                      <Text style={styles.instrumentTagCode}>{instrument.tagCode}</Text>
                      <Text style={styles.instrumentDescription}>
                        {instrument.shortDescription}
                      </Text>
                      <Text style={styles.instrumentMeta}>
                        {`${instrument.area} | ${instrument.range.min}-${instrument.range.max} ${instrument.range.unit} | ${instrument.tolerance}`}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, selected ? styles.checkboxSelected : null]}>
                      {selected ? <Text style={styles.checkboxMark}>x</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {!loading && step === 'metadata' ? (
        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollBodyContent}>
          <FormField label="Titulo">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={suggestedTitle}
              placeholderTextColor="#536679"
              style={styles.textInput}
            />
          </FormField>

          <FormField label="Equipe responsavel">
            <TextInput
              value={assignedTeam}
              onChangeText={setAssignedTeam}
              style={styles.textInput}
            />
          </FormField>

          <FormField label="Prioridade">
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setPriority('routine')}
                style={[styles.toggleButton, priority === 'routine' ? styles.toggleButtonActive : null]}
              >
                <Text style={styles.toggleButtonLabel}>Rotina</Text>
              </Pressable>
              <Pressable
                onPress={() => setPriority('high')}
                style={[styles.toggleButton, priority === 'high' ? styles.toggleButtonActive : null]}
              >
                <Text style={styles.toggleButtonLabel}>Alta</Text>
              </Pressable>
            </View>
          </FormField>

          <FormField label="Inicio (YYYY-MM-DD)">
            <TextInput
              value={startsAtIso}
              onChangeText={setStartsAtIso}
              placeholder="2026-05-16"
              placeholderTextColor="#536679"
              style={styles.textInput}
              autoCapitalize="none"
            />
          </FormField>

          <FormField label="Fim (YYYY-MM-DD)">
            <TextInput
              value={endsAtIso}
              onChangeText={setEndsAtIso}
              placeholder="2026-05-26"
              placeholderTextColor="#536679"
              style={styles.textInput}
              autoCapitalize="none"
            />
          </FormField>

          <FormField label="Tecnico responsavel">
            <View style={styles.technicianList}>
              {technicians.map((technician) => {
                const selected = assignedUserId === technician.id;
                return (
                  <Pressable
                    key={technician.id}
                    onPress={() => setAssignedUserId(technician.id)}
                    style={[styles.technicianRow, selected ? styles.technicianRowSelected : null]}
                  >
                    <Text style={styles.technicianName}>{technician.displayName}</Text>
                    <Text style={styles.technicianEmail}>{technician.email}</Text>
                  </Pressable>
                );
              })}
              {technicians.length === 0 ? (
                <Text style={styles.helpText}>Nenhum tecnico encontrado.</Text>
              ) : null}
            </View>
          </FormField>
        </ScrollView>
      ) : null}

      {!loading && step === 'confirm' ? (
        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollBodyContent}>
          <View style={styles.summaryCard}>
            <SummaryRow label="Titulo" value={title || suggestedTitle} />
            <SummaryRow label="Equipe" value={assignedTeam} />
            <SummaryRow
              label="Prioridade"
              value={priority === 'high' ? 'Alta' : 'Rotina'}
            />
            <SummaryRow label="Inicio" value={startsAtIso} />
            <SummaryRow label="Fim" value={endsAtIso} />
            <SummaryRow
              label="Tecnico"
              value={
                technicians.find((t) => t.id === assignedUserId)?.displayName ?? '-'
              }
            />
            <SummaryRow label="Instrumentos" value={`${selectedCount}`} />
          </View>
          <View style={styles.selectedListBlock}>
            <Text style={styles.selectedListHeader}>Instrumentos selecionados</Text>
            {selectedInstrumentIds.map((id) => {
              const instrument = instruments.find((i) => i.id === id);
              if (!instrument) return null;
              return (
                <Text key={id} style={styles.selectedListItem}>
                  {`${instrument.tagCode} - ${instrument.shortDescription}`}
                </Text>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <View style={styles.footer}>
        {step === 'instruments' ? (
          <>
            <Text style={styles.footerStatus}>{`${selectedCount} selecionado(s)`}</Text>
            <Pressable
              onPress={handleNextFromInstruments}
              disabled={selectedCount === 0}
              style={[
                styles.primaryButton,
                selectedCount === 0 ? styles.primaryButtonDisabled : null,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>Continuar</Text>
            </Pressable>
          </>
        ) : null}
        {step === 'metadata' ? (
          <>
            <Pressable onPress={() => setStep('instruments')} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Voltar</Text>
            </Pressable>
            <Pressable onPress={handleNextFromMetadata} style={styles.primaryButton}>
              <Text style={styles.primaryButtonLabel}>Continuar</Text>
            </Pressable>
          </>
        ) : null}
        {step === 'confirm' ? (
          <>
            <Pressable
              onPress={() => setStep('metadata')}
              style={styles.secondaryButton}
              disabled={submitting}
            >
              <Text style={styles.secondaryButtonLabel}>Voltar</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={[styles.primaryButton, submitting ? styles.primaryButtonDisabled : null]}
              disabled={submitting}
            >
              <Text style={styles.primaryButtonLabel}>
                {submitting ? 'Enviando...' : 'Criar pacote'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function buildInputAndValidate(input: CreateWorkPackageInput): void {
  validateCreateWorkPackageInput(input);
}

function StepIndicator({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <View
      style={[
        styles.stepperPill,
        active ? styles.stepperPillActive : null,
        done ? styles.stepperPillDone : null,
      ]}
    >
      <Text style={styles.stepperPillLabel}>{label}</Text>
    </View>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formFieldBlock}>
      <Text style={styles.formFieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryRowLabel}>{label}</Text>
      <Text style={styles.summaryRowValue}>{value}</Text>
    </View>
  );
}

function groupInstruments(instruments: CatalogInstrument[]): Array<{
  family: CatalogInstrumentFamily;
  items: CatalogInstrument[];
}> {
  const map = new Map<CatalogInstrumentFamily, CatalogInstrument[]>();
  for (const instrument of instruments) {
    const current = map.get(instrument.instrumentFamily) ?? [];
    current.push(instrument);
    map.set(instrument.instrumentFamily, current);
  }
  return Array.from(map.entries()).map(([family, items]) => ({ family, items }));
}

function familyOfFirstSelected(
  instruments: CatalogInstrument[],
  selectedIds: string[],
): CatalogInstrumentFamily | null {
  for (const id of selectedIds) {
    const instrument = instruments.find((i) => i.id === id);
    if (instrument) return instrument.instrumentFamily;
  }
  return null;
}

function formatError(error: unknown): string {
  if (error instanceof SupervisorAuthoringValidationError) {
    return error.message;
  }
  if (error instanceof SupervisorAuthoringApiError) {
    if (error.kind === 'network') {
      return 'Falha de rede. Verifique a conexao e tente novamente.';
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Erro inesperado.';
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a141c',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: '#16242f',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1a23',
  },
  headerTitle: { color: '#f1f7fc', fontSize: 18, fontWeight: '600' },
  headerCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1a2c39',
  },
  headerCloseLabel: { color: '#9bd1ff', fontSize: 14, fontWeight: '500' },
  stepperRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  stepperPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#162534',
    borderRadius: 16,
  },
  stepperPillActive: { backgroundColor: '#1f3b51' },
  stepperPillDone: { backgroundColor: '#1f4d35' },
  stepperPillLabel: { color: '#cfe5f5', fontSize: 12 },
  errorBanner: {
    backgroundColor: '#3a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorBannerText: { color: '#ffb4b4', fontSize: 13 },
  loadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  loadingText: { color: '#cfe5f5' },
  scrollBody: { flex: 1 },
  scrollBodyContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  familyBlock: { marginBottom: 14 },
  familyHeader: {
    color: '#9bd1ff',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 1,
  },
  instrumentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101e29',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderColor: '#16242f',
    borderWidth: 1,
  },
  instrumentRowSelected: {
    borderColor: '#3a8bd6',
    backgroundColor: '#142a3c',
  },
  instrumentRowMain: { flex: 1, marginRight: 12 },
  instrumentTagCode: { color: '#ffd28b', fontWeight: '600', fontSize: 15 },
  instrumentDescription: { color: '#e5eef6', fontSize: 13, marginTop: 2 },
  instrumentMeta: { color: '#7f97a8', fontSize: 11, marginTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderColor: '#3a5163',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#3a8bd6', borderColor: '#3a8bd6' },
  checkboxMark: { color: '#0a141c', fontSize: 14, fontWeight: '700' },
  formFieldBlock: { marginBottom: 14 },
  formFieldLabel: {
    color: '#9bd1ff',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: '#101e29',
    color: '#f1f7fc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#101e29',
    borderColor: '#16242f',
    borderWidth: 1,
  },
  toggleButtonActive: { backgroundColor: '#1f3b51', borderColor: '#3a8bd6' },
  toggleButtonLabel: { color: '#e5eef6', fontWeight: '500' },
  technicianList: { gap: 6 },
  technicianRow: {
    backgroundColor: '#101e29',
    padding: 10,
    borderRadius: 8,
    borderColor: '#16242f',
    borderWidth: 1,
  },
  technicianRowSelected: { borderColor: '#3a8bd6', backgroundColor: '#142a3c' },
  technicianName: { color: '#f1f7fc', fontSize: 14, fontWeight: '500' },
  technicianEmail: { color: '#7f97a8', fontSize: 12 },
  helpText: { color: '#7f97a8', fontSize: 12 },
  summaryCard: {
    backgroundColor: '#101e29',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryRowLabel: { color: '#7f97a8', fontSize: 12 },
  summaryRowValue: { color: '#f1f7fc', fontSize: 13, fontWeight: '500' },
  selectedListBlock: { marginBottom: 14 },
  selectedListHeader: {
    color: '#9bd1ff',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 1,
  },
  selectedListItem: { color: '#cfe5f5', fontSize: 12, paddingVertical: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopColor: '#16242f',
    borderTopWidth: 1,
    backgroundColor: '#0d1a23',
  },
  footerStatus: { color: '#cfe5f5', fontSize: 13 },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#3a8bd6',
    borderRadius: 8,
  },
  primaryButtonDisabled: { backgroundColor: '#1f3b51' },
  primaryButtonLabel: { color: '#0a141c', fontWeight: '700' },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#1a2c39',
    borderRadius: 8,
  },
  secondaryButtonLabel: { color: '#cfe5f5', fontWeight: '500' },
});
