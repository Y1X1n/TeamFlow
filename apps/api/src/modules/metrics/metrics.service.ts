import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Histogram, Registry, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });
  readonly wsConnections = new Gauge({
    name: 'ws_connections',
    help: 'Active WebSocket connections',
    registers: [this.registry],
  });
  readonly wsDocuments = new Gauge({
    name: 'ws_documents',
    help: 'Loaded Yjs documents',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  observeHttp(method: string, route: string, status: number, seconds: number): void {
    this.httpDuration.labels(method, route, String(status)).observe(seconds);
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
