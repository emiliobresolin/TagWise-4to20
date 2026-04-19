"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRepository = void 0;
class AuthRepository {
    database;
    constructor(database) {
        this.database = database;
    }
    async upsertSeedUser(user) {
        const now = new Date().toISOString();
        await this.database.query(`
        INSERT INTO auth_users (
          id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT(email) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          updated_at = EXCLUDED.updated_at;
      `, [
            user.id,
            user.email,
            user.displayName,
            user.role,
            user.passwordHash,
            user.passwordSalt,
            now,
        ]);
    }
    async findByEmail(email) {
        const result = await this.database.query(`
        SELECT
          id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          session_version
        FROM auth_users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1;
      `, [email]);
        return mapAuthUser(result.rows[0]);
    }
    async findById(id) {
        const result = await this.database.query(`
        SELECT
          id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          session_version
        FROM auth_users
        WHERE id = $1
        LIMIT 1;
      `, [id]);
        return mapAuthUser(result.rows[0]);
    }
}
exports.AuthRepository = AuthRepository;
function mapAuthUser(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        sessionVersion: row.session_version,
    };
}
