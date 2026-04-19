"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const node_crypto_1 = require("node:crypto");
function hashPassword(password, salt = createPasswordSalt()) {
    const hash = (0, node_crypto_1.scryptSync)(password, salt, 64).toString('hex');
    return {
        salt,
        hash,
    };
}
function verifyPassword(password, record) {
    const expected = Buffer.from(record.hash, 'hex');
    const actual = Buffer.from((0, node_crypto_1.scryptSync)(password, record.salt, 64));
    if (expected.length !== actual.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(expected, actual);
}
function createPasswordSalt() {
    return (0, node_crypto_1.randomBytes)(16).toString('hex');
}
