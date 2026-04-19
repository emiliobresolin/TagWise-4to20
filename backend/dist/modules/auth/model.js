"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationError = void 0;
class AuthenticationError extends Error {
    statusCode;
    constructor(message, statusCode = 401) {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = statusCode;
    }
}
exports.AuthenticationError = AuthenticationError;
