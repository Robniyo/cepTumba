import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { ActivityLogService } from './activity-log.service';

type AuthPayload = {
  sub?: string;
  email?: string;
  role?: string;
};

type RequestWithAuth = Request & {
  user?: AuthPayload;
};

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly activityLogService: ActivityLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithAuth>();
    const response = http.getResponse<Response>();

    const startedAt = Date.now();
    let capturedError: unknown;

    return next.handle().pipe(
      catchError((error) => {
        capturedError = error;
        return throwError(() => error);
      }),
      finalize(() => {
        const statusCode = this.resolveStatusCode(response.statusCode, capturedError);
        const durationMs = Date.now() - startedAt;
        const user = request.user;

        const metadata: Record<string, unknown> = {
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode,
          durationMs,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          userId: user?.sub ?? null,
          userEmail: user?.email ?? null,
          userRole: user?.role ?? null,
          query: request.query,
          params: request.params,
        };

        if (capturedError instanceof Error) {
          metadata.errorName = capturedError.name;
          metadata.errorMessage = capturedError.message;
        }

        this.activityLogService.logHttp({
          action: `${request.method} ${request.originalUrl ?? request.url}`,
          success: statusCode < 400,
          metadata,
        });
      }),
    );
  }

  private resolveStatusCode(
    fallbackStatus: number,
    error: unknown,
  ): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    return fallbackStatus;
  }
}
