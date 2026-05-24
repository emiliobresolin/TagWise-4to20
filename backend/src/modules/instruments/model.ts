export type InstrumentFamily =
  | 'pressure transmitter'
  | 'temperature transmitter / RTD input'
  | 'level transmitter'
  | 'control valve with positioner'
  | 'analog 4-20 mA loop';

export type InstrumentCriticality = 'medium' | 'high';

export interface InstrumentRange {
  min: number;
  max: number;
  unit: string;
}

export interface Instrument {
  id: string;
  tagCode: string;
  shortDescription: string;
  area: string;
  parentAssetReference: string;
  instrumentFamily: InstrumentFamily;
  instrumentSubtype: string;
  measuredVariable: string;
  signalType: string;
  range: InstrumentRange;
  tolerance: string;
  criticality: InstrumentCriticality;
  defaultTemplateId: string;
  defaultGuidanceReferenceId: string;
  defaultHistorySummaryId: string | null;
}

export class InstrumentsError extends Error {
  readonly statusCode: number;
  readonly missingIds?: string[];

  constructor(message: string, statusCode = 400, missingIds?: string[]) {
    super(message);
    this.name = 'InstrumentsError';
    this.statusCode = statusCode;
    this.missingIds = missingIds;
  }
}
