import type { ZodSchema } from 'zod';
import type { PipeTransform } from '@nestjs/common';
import { DomainError } from './domain-error';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainError(
        'VALIDATION_ERROR',
        400,
        '请求参数不合法',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
