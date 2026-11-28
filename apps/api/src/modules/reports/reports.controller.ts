import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  generateReportSchema,
  periodReportNarrativeSchema,
  periodReportQuerySchema,
  previewReportEmailSchema,
  reportsQuerySchema,
  sendReportEmailSchema,
  type GenerateReportInput,
  type PeriodReportNarrativeInput,
  type PeriodReportQuery,
  type PreviewReportEmailInput,
  type ReportsQuery,
  type SendReportEmailInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequirePermission } from '../permissions/permission.decorators';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('projects/:projectId/reports')
  @RequirePermission('report:view')
  list(
    @Param('projectId') projectId: string,
    @Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQuery,
  ) {
    return this.reports.list(projectId, query.limit ?? 12);
  }

  @Get('projects/:projectId/reports/current')
  @RequirePermission('report:view')
  current(@Param('projectId') projectId: string) {
    return this.reports.current(projectId);
  }

  @Get('projects/:projectId/reports/period')
  @RequirePermission('report:view')
  period(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Query(new ZodValidationPipe(periodReportQuerySchema)) query: PeriodReportQuery,
  ) {
    return this.reports.period(projectId, user.id, query);
  }

  @Post('projects/:projectId/reports/period/narrative')
  @HttpCode(200)
  @RequirePermission('report:view')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  periodNarrative(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(periodReportNarrativeSchema)) body: PeriodReportNarrativeInput,
  ) {
    return this.reports.periodNarrative(projectId, user.id, body);
  }

  @Get('projects/:projectId/reports/current/email/status')
  @RequirePermission('report:generate')
  emailStatus() {
    return this.reports.emailStatus();
  }

  @Post('projects/:projectId/reports/current/email/preview')
  @HttpCode(200)
  @RequirePermission('report:generate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  previewEmail(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(previewReportEmailSchema)) body: PreviewReportEmailInput,
  ) {
    return this.reports.previewEmail(projectId, user.id, body);
  }

  @Post('projects/:projectId/reports/current/email/send')
  @HttpCode(200)
  @RequirePermission('report:generate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendEmail(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(sendReportEmailSchema)) body: SendReportEmailInput,
  ) {
    return this.reports.sendEmail(projectId, user.id, body);
  }

  @Post('projects/:projectId/reports/generate')
  @HttpCode(201)
  @RequirePermission('report:generate')
  generate(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(generateReportSchema)) body: GenerateReportInput,
  ) {
    return this.reports.generateManual(projectId, body, user.id);
  }

  @Get('reports/:reportId')
  @RequirePermission('report:view')
  get(@Param('reportId') reportId: string) {
    return this.reports.get(reportId);
  }
}
