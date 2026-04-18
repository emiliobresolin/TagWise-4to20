"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPostgresPool = createPostgresPool;
exports.verifyPostgresConnectivity = verifyPostgresConnectivity;
const pg_1 = require("pg");
function createPostgresPool(environment) {
    return new pg_1.Pool({
        connectionString: environment.databaseUrl,
        application_name: `tagwise-${environment.serviceRole}`,
        max: environment.serviceRole === 'worker' ? 5 : 10,
    });
}
async function verifyPostgresConnectivity(database) {
    await database.query('SELECT 1;');
}
