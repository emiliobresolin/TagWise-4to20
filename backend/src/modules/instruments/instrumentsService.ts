import { buildSeedInstruments } from './seedData';
import type { Instrument } from './model';
import { InstrumentsError } from './model';
import { InstrumentsRepository } from './instrumentsRepository';

export class InstrumentsService {
  constructor(private readonly repository: InstrumentsRepository) {}

  async ensureSeedInstruments(): Promise<void> {
    for (const instrument of buildSeedInstruments()) {
      await this.repository.upsertSeedInstrument(instrument);
    }
  }

  async listInstruments(): Promise<Instrument[]> {
    return this.repository.listAll();
  }

  async resolveInstruments(ids: readonly string[]): Promise<Instrument[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      throw new InstrumentsError('At least one instrument id is required.', 400);
    }

    const found = await this.repository.findManyByIds(uniqueIds);
    const foundById = new Map(found.map((instrument) => [instrument.id, instrument]));
    const missing = uniqueIds.filter((id) => !foundById.has(id));

    if (missing.length > 0) {
      throw new InstrumentsError(
        `Unknown instrument ids: ${missing.join(', ')}.`,
        400,
        missing,
      );
    }

    return uniqueIds.map((id) => foundById.get(id) as Instrument);
  }
}
