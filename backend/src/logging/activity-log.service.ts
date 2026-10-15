import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';

export type ActivityLogEntry = {
  timestamp: string;
  category: 'http' | 'system';
  action: string;
  success: boolean;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ActivityLogService implements OnModuleDestroy {
  private readonly logger = new Logger(ActivityLogService.name);
  private readonly filePath: string;
  private readonly initPromise: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private fileLoggingEnabled = true;

  constructor(private readonly configService: ConfigService) {
    const configuredPath =
      this.configService.get<string>('ACTIVITY_LOG_FILE') ??
      'logs/system-activity.log';

    this.filePath = this.resolvePath(configuredPath);
    this.initPromise = mkdir(dirname(this.filePath), { recursive: true })
      .then(() => undefined)
      .catch((error: unknown) => {
        this.fileLoggingEnabled = false;
        const message =
          error instanceof Error ? error.message : 'Unknown initialization error';
        this.logger.warn(`Activity file logging disabled: ${message}`);
      });
  }

  logHttp(entry: {
    action: string;
    success: boolean;
    metadata: Record<string, unknown>;
  }): void {
    this.enqueueWrite({
      timestamp: new Date().toISOString(),
      category: 'http',
      action: entry.action,
      success: entry.success,
      metadata: entry.metadata,
    });
  }

  logSystem(entry: {
    action: string;
    success?: boolean;
    metadata?: Record<string, unknown>;
  }): void {
    this.enqueueWrite({
      timestamp: new Date().toISOString(),
      category: 'system',
      action: entry.action,
      success: entry.success ?? true,
      metadata: entry.metadata,
    });
  }

  private resolvePath(pathValue: string): string {
    if (pathValue.startsWith('/')) {
      return pathValue;
    }

    if (process.env.VERCEL === '1') {
      return resolve('/tmp', pathValue);
    }

    return resolve(process.cwd(), pathValue);
  }

  private enqueueWrite(entry: ActivityLogEntry): void {
    if (!this.fileLoggingEnabled) {
      return;
    }

    const line = `${JSON.stringify(entry)}\n`;

    this.writeQueue = this.writeQueue
      .then(async () => {
        await this.initPromise;
        if (!this.fileLoggingEnabled) {
          return;
        }
        await appendFile(this.filePath, line, 'utf8');
      })
      .catch((error: unknown) => {
        this.fileLoggingEnabled = false;
        const message =
          error instanceof Error ? error.message : 'Unknown activity log error';
        this.logger.warn(`Activity file logging disabled: ${message}`);
      });
  }

  async onModuleDestroy(): Promise<void> {
    await this.writeQueue;
  }
}
