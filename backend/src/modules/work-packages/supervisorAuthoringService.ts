import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../auth/model';
import type { AuthRepository } from '../auth/authRepository';
import type { Instrument } from '../instruments/model';
import type { InstrumentsService } from '../instruments/instrumentsService';
import type {
  AssignedWorkPackageGuidanceSnapshot,
  AssignedWorkPackagePriority,
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageSummary,
  AssignedWorkPackageTagSnapshot,
  AssignedWorkPackageTemplateSnapshot,
} from './model';
import {
  getAuthoredGuidance,
  getAuthoredTemplate,
} from './templateRegistry';
import type { AssignedWorkPackageRepository } from './assignedWorkPackageRepository';

export const SUPERVISOR_PACKAGE_ID_PREFIX = 'pkg-sup-';
export const SUPERVISOR_PACKAGE_CONTRACT_VERSION = '2026-04-v1';

export interface CreateSupervisorPackageInput {
  title: string;
  assignedTeam: string;
  priority: AssignedWorkPackagePriority;
  dueWindow: {
    startsAt: string | null;
    endsAt: string | null;
  };
  assignedUserId: string;
  instrumentIds: string[];
}

export class SupervisorAuthoringError extends Error {
  readonly statusCode: number;
  readonly missingIds?: string[];

  constructor(message: string, statusCode = 400, missingIds?: string[]) {
    super(message);
    this.name = 'SupervisorAuthoringError';
    this.statusCode = statusCode;
    this.missingIds = missingIds;
  }
}

export class SupervisorAuthoringService {
  constructor(
    private readonly instrumentsService: InstrumentsService,
    private readonly authRepository: AuthRepository,
    private readonly workPackageRepository: AssignedWorkPackageRepository,
  ) {}

  async createWorkPackage(
    supervisor: AuthenticatedUser,
    input: CreateSupervisorPackageInput,
  ): Promise<AssignedWorkPackageSnapshot> {
    if (supervisor.role !== 'supervisor' && supervisor.role !== 'manager') {
      throw new SupervisorAuthoringError(
        'Supervisor or manager role is required to create work packages.',
        403,
      );
    }

    const title = input.title?.trim() ?? '';
    if (title.length < 3 || title.length > 120) {
      throw new SupervisorAuthoringError('Title must be between 3 and 120 characters.');
    }

    const assignedTeam = input.assignedTeam?.trim() ?? '';
    if (assignedTeam.length === 0 || assignedTeam.length > 80) {
      throw new SupervisorAuthoringError('Assigned team is required (max 80 characters).');
    }

    if (input.priority !== 'routine' && input.priority !== 'high') {
      throw new SupervisorAuthoringError(
        "Priority must be 'routine' or 'high'.",
      );
    }

    if (!Array.isArray(input.instrumentIds) || input.instrumentIds.length === 0) {
      throw new SupervisorAuthoringError('At least one instrument is required.');
    }

    if (input.dueWindow.startsAt && input.dueWindow.endsAt) {
      const starts = Date.parse(input.dueWindow.startsAt);
      const ends = Date.parse(input.dueWindow.endsAt);
      if (Number.isFinite(starts) && Number.isFinite(ends) && ends < starts) {
        throw new SupervisorAuthoringError(
          'Due window end must be on or after the start.',
        );
      }
    }

    const technician = await this.authRepository.findById(input.assignedUserId);
    if (!technician || technician.role !== 'technician') {
      throw new SupervisorAuthoringError(
        'Assigned user must be an existing technician.',
      );
    }

    const instruments = await this.instrumentsService.resolveInstruments(input.instrumentIds);

    const generatedAt = new Date().toISOString();
    const workPackageId = `${SUPERVISOR_PACKAGE_ID_PREFIX}${randomUUID()}`;
    const sourceReference = `supervisor:${supervisor.id}:${generatedAt}`;

    const tags = instruments.map(buildTagSnapshot);
    const templates = collectTemplates(instruments);
    const guidance = collectGuidance(instruments);

    const summary: AssignedWorkPackageSummary = {
      id: workPackageId,
      sourceReference,
      title,
      assignedTeam,
      priority: input.priority,
      status: 'assigned',
      packageVersion: 1,
      snapshotContractVersion: SUPERVISOR_PACKAGE_CONTRACT_VERSION,
      tagCount: tags.length,
      dueWindow: {
        startsAt: input.dueWindow.startsAt,
        endsAt: input.dueWindow.endsAt,
      },
      updatedAt: generatedAt,
    };

    const snapshot: AssignedWorkPackageSnapshot = {
      contractVersion: SUPERVISOR_PACKAGE_CONTRACT_VERSION,
      generatedAt,
      summary,
      tags,
      templates,
      guidance,
      historySummaries: [],
      priorTestReadings: [],
    };

    await this.workPackageRepository.upsertSeedPackage({
      assignedUserId: technician.id,
      summary,
      snapshot,
    });

    return snapshot;
  }
}

function buildTagSnapshot(instrument: Instrument): AssignedWorkPackageTagSnapshot {
  return {
    id: `tag-${instrument.id}`,
    tagCode: instrument.tagCode,
    shortDescription: instrument.shortDescription,
    area: instrument.area,
    parentAssetReference: instrument.parentAssetReference,
    instrumentFamily: instrument.instrumentFamily,
    instrumentSubtype: instrument.instrumentSubtype,
    measuredVariable: instrument.measuredVariable,
    signalType: instrument.signalType,
    range: {
      min: instrument.range.min,
      max: instrument.range.max,
      unit: instrument.range.unit,
    },
    tolerance: instrument.tolerance,
    criticality: instrument.criticality === 'high' ? 'high' : 'medium',
    templateIds: [instrument.defaultTemplateId],
    guidanceReferenceIds: [instrument.defaultGuidanceReferenceId],
    historySummaryId: instrument.defaultHistorySummaryId ?? '',
  };
}

function collectTemplates(
  instruments: Instrument[],
): AssignedWorkPackageTemplateSnapshot[] {
  const seen = new Set<string>();
  const collected: AssignedWorkPackageTemplateSnapshot[] = [];

  for (const instrument of instruments) {
    if (seen.has(instrument.defaultTemplateId)) {
      continue;
    }
    seen.add(instrument.defaultTemplateId);

    const template = getAuthoredTemplate(instrument.defaultTemplateId);
    if (!template) {
      throw new SupervisorAuthoringError(
        `Template ${instrument.defaultTemplateId} is not in the authored template registry.`,
        500,
      );
    }
    collected.push(template);
  }

  return collected;
}

function collectGuidance(
  instruments: Instrument[],
): AssignedWorkPackageGuidanceSnapshot[] {
  const seen = new Set<string>();
  const collected: AssignedWorkPackageGuidanceSnapshot[] = [];

  for (const instrument of instruments) {
    if (seen.has(instrument.defaultGuidanceReferenceId)) {
      continue;
    }
    seen.add(instrument.defaultGuidanceReferenceId);

    const guidance = getAuthoredGuidance(instrument.defaultGuidanceReferenceId);
    if (!guidance) {
      throw new SupervisorAuthoringError(
        `Guidance ${instrument.defaultGuidanceReferenceId} is not in the authored guidance registry.`,
        500,
      );
    }
    collected.push(guidance);
  }

  return collected;
}
