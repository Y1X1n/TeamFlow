import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import { problemType, type ProblemDetails } from '@teamflow/shared/errors';
import { DomainError } from './domain-error';
import { redactSensitiveUrl } from './log-redaction';

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let detail = 'Internal server error';
    let errors: ProblemDetails['errors'];

    if (exception instanceof DomainError) {
      status = exception.status;
      code = exception.code;
      detail = exception.message;
      errors = exception.errors;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        detail = 'Resource not found';
      } else if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        detail = 'Resource already exists';
      } else if (exception.code === 'P2003') {
        status = 409;
        code = 'COLUMN_BUSY';
        detail = '关联数据已变化，请刷新后重试';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      let customCode: string | undefined;
      if (typeof body === 'string') {
        detail = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        if (typeof record.code === 'string') customCode = record.code;
        if (typeof record.detail === 'string') detail = record.detail;
        else if (Array.isArray(record.message)) detail = record.message.join('; ');
        else if (typeof record.message === 'string') detail = record.message;
      }
      code =
        customCode ??
        (
          {
            400: 'VALIDATION_ERROR',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            413: 'FILE_TOO_LARGE',
            415: 'UNSUPPORTED_FILE_TYPE',
            422: 'VALIDATION_ERROR',
            429: 'RATE_LIMITED',
          } as Record<number, string>
        )[status] ??
        code;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${redactSensitiveUrl(request.originalUrl)} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      if (Sentry.getClient()) Sentry.captureException(exception);
    }

    const body: ProblemDetails = {
      type: problemType(code),
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      code,
      errors,
      requestId: request.requestId,
    };
    response.status(status).type('application/problem+json').json(body);
  }
}
