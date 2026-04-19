import type { WriteAuditEventInput } from './model';
import { AuditEventRepository } from './auditEventRepository';

export class AuditEventService {
  constructor(private readonly repository: AuditEventRepository) {}

  async recordEvent(input: WriteAuditEventInput) {
    return this.repository.writeEvent(input);
  }
}
