import type { ActiveUserSession } from '../auth/model';
import type {
  CatalogInstrument,
  CatalogTechnician,
  CreateWorkPackageInput,
  CreateWorkPackageResult,
} from './model';
import type { SupervisorAuthoringApiClient } from './supervisorAuthoringApiClient';

export class SupervisorAuthoringAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupervisorAuthoringAccessError';
  }
}

export class SupervisorAuthoringValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupervisorAuthoringValidationError';
  }
}

export class SupervisorAuthoringService {
  constructor(private readonly apiClient: SupervisorAuthoringApiClient) {}

  async loadCatalog(
    session: ActiveUserSession,
  ): Promise<{ instruments: CatalogInstrument[]; technicians: CatalogTechnician[] }> {
    assertConnectedSupervisorOrManager(session);
    const [instruments, technicians] = await Promise.all([
      this.apiClient.listInstruments(),
      this.apiClient.listTechnicians(),
    ]);
    return { instruments, technicians };
  }

  async submitNewPackage(
    session: ActiveUserSession,
    input: CreateWorkPackageInput,
  ): Promise<CreateWorkPackageResult> {
    assertConnectedSupervisorOrManager(session);
    validateCreateWorkPackageInput(input);
    return this.apiClient.createWorkPackage(input);
  }
}

export function validateCreateWorkPackageInput(input: CreateWorkPackageInput): void {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) {
    throw new SupervisorAuthoringValidationError(
      'Titulo deve ter entre 3 e 120 caracteres.',
    );
  }

  const assignedTeam = input.assignedTeam.trim();
  if (assignedTeam.length === 0 || assignedTeam.length > 80) {
    throw new SupervisorAuthoringValidationError(
      'Equipe responsavel e obrigatoria (max 80 caracteres).',
    );
  }

  if (input.priority !== 'routine' && input.priority !== 'high') {
    throw new SupervisorAuthoringValidationError(
      "Prioridade deve ser 'routine' ou 'high'.",
    );
  }

  if (!input.assignedUserId || input.assignedUserId.trim().length === 0) {
    throw new SupervisorAuthoringValidationError(
      'Selecione um tecnico para atribuir o pacote.',
    );
  }

  if (!Array.isArray(input.instrumentIds) || input.instrumentIds.length === 0) {
    throw new SupervisorAuthoringValidationError(
      'Selecione pelo menos um instrumento.',
    );
  }

  if (input.dueWindow.startsAt && input.dueWindow.endsAt) {
    const starts = Date.parse(input.dueWindow.startsAt);
    const ends = Date.parse(input.dueWindow.endsAt);
    if (Number.isFinite(starts) && Number.isFinite(ends) && ends < starts) {
      throw new SupervisorAuthoringValidationError(
        'Janela de execucao: fim deve ser igual ou posterior ao inicio.',
      );
    }
  }
}

function assertConnectedSupervisorOrManager(session: ActiveUserSession): void {
  if (session.role !== 'supervisor' && session.role !== 'manager') {
    throw new SupervisorAuthoringAccessError(
      'Perfil supervisor ou manager e necessario para criar pacotes.',
    );
  }
  if (session.connectionMode !== 'connected') {
    throw new SupervisorAuthoringAccessError(
      'Conexao online e necessaria para criar pacotes.',
    );
  }
}
