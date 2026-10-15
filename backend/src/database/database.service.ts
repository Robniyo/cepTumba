import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const dbHost = this.configService.get<string>('DB_HOST') ?? '127.0.0.1';
    const dbPort = Number(this.configService.get<string>('DB_PORT') ?? '5432');
    const dbMaxConnections = Number(
      this.configService.get<string>('DB_MAX_CONNECTIONS') ?? '10',
    );
    const dbSslValue = (this.configService.get<string>('DB_SSL') ?? '').trim().toLowerCase();
    const explicitSsl = ['true', '1', 'yes', 'require'].includes(dbSslValue);
    const explicitNoSsl = ['false', '0', 'no', 'disable'].includes(dbSslValue);
    const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(dbHost);
    const isServerlessRuntime = process.env.VERCEL === '1';
    const useSsl =
      isServerlessRuntime ||
      explicitSsl ||
      (!explicitNoSsl && !isLocalHost);

    this.pool = new Pool({
      host: dbHost,
      port: Number.isNaN(dbPort) ? 5432 : dbPort,
      user: this.configService.get<string>('DB_USER') ?? 'postgres',
      password: this.configService.get<string>('DB_PASSWORD') ?? 'postgres',
      database: this.configService.get<string>('DB_NAME') ?? 'cep_tumba',
      max: Number.isNaN(dbMaxConnections) ? 10 : dbMaxConnections,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBaseSchema();
  }

  private async ensureBaseSchema(): Promise<void> {
    await this.pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await this.pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await this.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
          CREATE TYPE app_role AS ENUM (
            'president','vp_prayers','vp_social','advisor_prayers',
            'advisor_social','accountant','secretary','member'
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
          CREATE TYPE member_status AS ENUM ('active','inactive','graduated','suspended');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_kind') THEN
          CREATE TYPE gender_kind AS ENUM ('male','female','other');
        END IF;
      END $$;
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        member_no text NOT NULL UNIQUE,
        full_name text NOT NULL,
        email citext UNIQUE,
        phone text,
        department text,
        year_of_study text,
        fellowship text,
        status member_status NOT NULL DEFAULT 'active',
        joined_at date,
        baptized boolean NOT NULL DEFAULT false,
        avatar_hue smallint NOT NULL DEFAULT 0 CHECK (avatar_hue >= 0 AND avatar_hue < 360),
        date_of_birth date,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Idempotent column add for gender (existing deployments)
    await this.pool.query(`
      ALTER TABLE members
      ADD COLUMN IF NOT EXISTS gender gender_kind
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE,
        password_hash text,
        display_name text NOT NULL,
        role app_role NOT NULL DEFAULT 'member',
        member_id uuid UNIQUE REFERENCES members(id) ON DELETE SET NULL,
        is_active boolean NOT NULL DEFAULT true,
        last_login_at timestamptz,
        refresh_token_hash text,
        refresh_token_expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}