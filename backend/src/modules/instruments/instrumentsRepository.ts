import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type {
  Instrument,
  InstrumentCriticality,
  InstrumentFamily,
} from './model';

interface InstrumentRow extends QueryResultRow {
  id: string;
  tag_code: string;
  short_description: string;
  area: string;
  parent_asset_reference: string;
  instrument_family: InstrumentFamily;
  instrument_subtype: string;
  measured_variable: string;
  signal_type: string;
  range_min: number;
  range_max: number;
  range_unit: string;
  tolerance: string;
  criticality: InstrumentCriticality;
  default_template_id: string;
  default_guidance_reference_id: string;
  default_history_summary_id: string | null;
}

export class InstrumentsRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async upsertSeedInstrument(instrument: Instrument): Promise<void> {
    const now = new Date().toISOString();

    await this.database.query(
      `
        INSERT INTO instruments (
          id,
          tag_code,
          short_description,
          area,
          parent_asset_reference,
          instrument_family,
          instrument_subtype,
          measured_variable,
          signal_type,
          range_min,
          range_max,
          range_unit,
          tolerance,
          criticality,
          default_template_id,
          default_guidance_reference_id,
          default_history_summary_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)
        ON CONFLICT (id) DO UPDATE SET
          tag_code = EXCLUDED.tag_code,
          short_description = EXCLUDED.short_description,
          area = EXCLUDED.area,
          parent_asset_reference = EXCLUDED.parent_asset_reference,
          instrument_family = EXCLUDED.instrument_family,
          instrument_subtype = EXCLUDED.instrument_subtype,
          measured_variable = EXCLUDED.measured_variable,
          signal_type = EXCLUDED.signal_type,
          range_min = EXCLUDED.range_min,
          range_max = EXCLUDED.range_max,
          range_unit = EXCLUDED.range_unit,
          tolerance = EXCLUDED.tolerance,
          criticality = EXCLUDED.criticality,
          default_template_id = EXCLUDED.default_template_id,
          default_guidance_reference_id = EXCLUDED.default_guidance_reference_id,
          default_history_summary_id = EXCLUDED.default_history_summary_id,
          updated_at = EXCLUDED.updated_at;
      `,
      [
        instrument.id,
        instrument.tagCode,
        instrument.shortDescription,
        instrument.area,
        instrument.parentAssetReference,
        instrument.instrumentFamily,
        instrument.instrumentSubtype,
        instrument.measuredVariable,
        instrument.signalType,
        instrument.range.min,
        instrument.range.max,
        instrument.range.unit,
        instrument.tolerance,
        instrument.criticality,
        instrument.defaultTemplateId,
        instrument.defaultGuidanceReferenceId,
        instrument.defaultHistorySummaryId,
        now,
      ],
    );
  }

  async listAll(): Promise<Instrument[]> {
    const result = await this.database.query<InstrumentRow>(
      `
        SELECT
          id,
          tag_code,
          short_description,
          area,
          parent_asset_reference,
          instrument_family,
          instrument_subtype,
          measured_variable,
          signal_type,
          range_min,
          range_max,
          range_unit,
          tolerance,
          criticality,
          default_template_id,
          default_guidance_reference_id,
          default_history_summary_id
        FROM instruments
        ORDER BY instrument_family ASC, tag_code ASC;
      `,
    );

    return result.rows.map(mapInstrumentRow);
  }

  async findManyByIds(ids: readonly string[]): Promise<Instrument[]> {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const result = await this.database.query<InstrumentRow>(
      `
        SELECT
          id,
          tag_code,
          short_description,
          area,
          parent_asset_reference,
          instrument_family,
          instrument_subtype,
          measured_variable,
          signal_type,
          range_min,
          range_max,
          range_unit,
          tolerance,
          criticality,
          default_template_id,
          default_guidance_reference_id,
          default_history_summary_id
        FROM instruments
        WHERE id IN (${placeholders});
      `,
      ids as unknown as string[],
    );

    return result.rows.map(mapInstrumentRow);
  }
}

function mapInstrumentRow(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    tagCode: row.tag_code,
    shortDescription: row.short_description,
    area: row.area,
    parentAssetReference: row.parent_asset_reference,
    instrumentFamily: row.instrument_family,
    instrumentSubtype: row.instrument_subtype,
    measuredVariable: row.measured_variable,
    signalType: row.signal_type,
    range: {
      min: Number(row.range_min),
      max: Number(row.range_max),
      unit: row.range_unit,
    },
    tolerance: row.tolerance,
    criticality: row.criticality,
    defaultTemplateId: row.default_template_id,
    defaultGuidanceReferenceId: row.default_guidance_reference_id,
    defaultHistorySummaryId: row.default_history_summary_id,
  };
}
