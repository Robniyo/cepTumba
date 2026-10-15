import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AppRole } from '../auth/auth-role.type';

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  role: AppRole;
  is_active: boolean;
  refresh_token_hash: string | null;
  refresh_token_expires_at: string | null;
};

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string;
  role: AppRole;
  isActive: boolean;
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureAuthColumns(): Promise<void> {
    await this.databaseService.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS refresh_token_hash text,
        ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        requested_ip text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
      ON password_reset_tokens (user_id)
    `);
  }

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string | null;
  }): Promise<{ id: string }> {
    // Invalidate any outstanding (unused, unexpired) tokens for this user.
    await this.databaseService.query(
      `
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
      `,
      [input.userId],
    );

    const result = await this.databaseService.query<{ id: string }>(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [
        input.userId,
        input.tokenHash,
        input.expiresAt.toISOString(),
        input.requestedIp ?? null,
      ],
    );

    return { id: result.rows[0].id };
  }

  async findActivePasswordResetTokensByUserId(
    userId: string,
  ): Promise<Array<{ id: string; tokenHash: string; expiresAt: Date }>> {
    const result = await this.databaseService.query<{
      id: string;
      token_hash: string;
      expires_at: string;
    }>(
      `
      SELECT id, token_hash, expires_at
      FROM password_reset_tokens
      WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
    }));
  }

  async findAllActivePasswordResetTokens(): Promise<
    Array<{ id: string; userId: string; tokenHash: string; expiresAt: Date }>
  > {
    const result = await this.databaseService.query<{
      id: string;
      user_id: string;
      token_hash: string;
      expires_at: string;
    }>(
      `
      SELECT id, user_id, token_hash, expires_at
      FROM password_reset_tokens
      WHERE used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
    }));
  }

  async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`,
      [tokenId],
    );
  }

  async countUsers(): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM users',
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.databaseService.query<UserRow>(
      `
      SELECT
        id,
        email,
        password_hash,
        display_name,
        role,
        is_active,
        refresh_token_hash,
        refresh_token_expires_at
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email.trim().toLowerCase()],
    );

    return result.rows[0] ? this.mapUserRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const result = await this.databaseService.query<UserRow>(
      `
      SELECT
        id,
        email,
        password_hash,
        display_name,
        role,
        is_active,
        refresh_token_hash,
        refresh_token_expires_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ? this.mapUserRow(result.rows[0]) : null;
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
    name: string;
    role: AppRole;
  }): Promise<UserRecord> {
    try {
      const result = await this.databaseService.query<UserRow>(
        `
        INSERT INTO users (email, password_hash, display_name, role, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING
          id,
          email,
          password_hash,
          display_name,
          role,
          is_active,
          refresh_token_hash,
          refresh_token_expires_at
        `,
        [
          input.email.trim().toLowerCase(),
          input.passwordHash,
          input.name.trim(),
          input.role,
        ],
      );

      return this.mapUserRow(result.rows[0]);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async updateProfile(
    userId: string,
    input: { email?: string; name?: string },
  ): Promise<UserRecord> {
    const updates: string[] = [];
    const values: unknown[] = [userId];
    let parameterIndex = 2;

    if (input.email !== undefined) {
      updates.push(`email = $${parameterIndex}`);
      values.push(input.email.trim().toLowerCase());
      parameterIndex += 1;
    }

    if (input.name !== undefined) {
      updates.push(`display_name = $${parameterIndex}`);
      values.push(input.name.trim());
      parameterIndex += 1;
    }

    if (updates.length === 0) {
      const existingUser = await this.findById(userId);
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }
      return existingUser;
    }

    try {
      const result = await this.databaseService.query<UserRow>(
        `
        UPDATE users
        SET
          ${updates.join(',\n          ')},
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          email,
          password_hash,
          display_name,
          role,
          is_active,
          refresh_token_hash,
          refresh_token_expires_at
        `,
        values,
      );

      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('User not found');
      }

      return this.mapUserRow(row);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const result = await this.databaseService.query<{ id: string }>(
      `
      UPDATE users
      SET
        password_hash = $2,
        updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [userId, passwordHash],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('User not found');
    }
  }

  async setRefreshToken(
    userId: string,
    refreshTokenHash: string,
    refreshTokenExpiresAt: Date,
  ): Promise<void> {
    await this.databaseService.query(
      `
      UPDATE users
      SET
        refresh_token_hash = $2,
        refresh_token_expires_at = $3,
        updated_at = now()
      WHERE id = $1
      `,
      [userId, refreshTokenHash, refreshTokenExpiresAt.toISOString()],
    );
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.databaseService.query(
      `
      UPDATE users
      SET
        refresh_token_hash = NULL,
        refresh_token_expires_at = NULL,
        updated_at = now()
      WHERE id = $1
      `,
      [userId],
    );
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.databaseService.query(
      `
      UPDATE users
      SET
        last_login_at = now(),
        updated_at = now()
      WHERE id = $1
      `,
      [userId],
    );
  }

  private mapUserRow(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.display_name,
      role: row.role,
      isActive: row.is_active,
      refreshTokenHash: row.refresh_token_hash,
      refreshTokenExpiresAt: row.refresh_token_expires_at
        ? new Date(row.refresh_token_expires_at)
        : null,
    };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as { code?: string };
    return maybeError.code === '23505';
  }
}
