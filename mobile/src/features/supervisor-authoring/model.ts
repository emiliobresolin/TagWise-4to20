export type CatalogInstrumentFamily =
  | 'pressure transmitter'
  | 'temperature transmitter / RTD input'
  | 'level transmitter'
  | 'control valve with positioner'
  | 'analog 4-20 mA loop';

export interface CatalogInstrumentRange {
  min: number;
  max: number;
  unit: string;
}

export interface CatalogInstrument {
  id: string;
  tagCode: string;
  shortDescription: string;
  area: string;
  parentAssetReference: string;
  instrumentFamily: CatalogInstrumentFamily;
  instrumentSubtype: string;
  measuredVariable: string;
  signalType: string;
  range: CatalogInstrumentRange;
  tolerance: string;
  criticality: 'medium' | 'high';
}

export interface CatalogTechnician {
  id: string;
  displayName: string;
  email: string;
}

export type SupervisorWorkPackagePriority = 'routine' | 'high';

export interface CreateWorkPackageInput {
  title: string;
  assignedTeam: string;
  priority: SupervisorWorkPackagePriority;
  dueWindow: {
    startsAt: string | null;
    endsAt: string | null;
  };
  assignedUserId: string;
  instrumentIds: string[];
}

export interface CreateWorkPackageResult {
  workPackageId: string;
  title: string;
  tagCount: number;
  assignedUserId: string;
}

export const SUPERVISOR_AUTHORING_FAMILY_LABEL_PT_BR: Record<
  CatalogInstrumentFamily,
  string
> = {
  'pressure transmitter': 'Transmissores de pressao',
  'temperature transmitter / RTD input': 'Transmissores de temperatura / RTD',
  'level transmitter': 'Transmissores de nivel',
  'control valve with positioner': 'Valvulas de controle com posicionador',
  'analog 4-20 mA loop': 'Loops analogicos 4-20 mA',
};
