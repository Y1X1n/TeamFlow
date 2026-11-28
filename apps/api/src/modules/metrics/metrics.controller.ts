import {
  Controller,
  Get,
  Header,
  Injectable,
  NotFoundException,
  Req,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';
import { isPrivateAddress } from '../../common/ip';
import { Public } from '../../common/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metricsText(@Req() request: Request): Promise<string> {
    const token = this.config.get<string>('METRICS_TOKEN');
    const authorization = request.headers.authorization;
    if (token) {
      if (authorization !== `Bearer ${token}`) throw new NotFoundException();
    } else if (!isPrivateAddress(request.socket.remoteAddress)) {
      throw new NotFoundException();
    }
    return this.metrics.metrics();
  }
}

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    return next.handle().pipe(
      finalize(() => {
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;
        this.metrics.observeHttp(request.method, route, response.statusCode, seconds);
      }),
    );
  }
}
