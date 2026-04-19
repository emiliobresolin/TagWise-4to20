"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEventService = void 0;
class AuditEventService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async recordEvent(input) {
        return this.repository.writeEvent(input);
    }
}
exports.AuditEventService = AuditEventService;
