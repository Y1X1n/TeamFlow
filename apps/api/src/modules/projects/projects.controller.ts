import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  createProjectSchema,
  projectsQuerySchema,
  updateProjectSchema,
  type CreateProjectInput,
  type ProjectsQuery,
  type UpdateProjectInput,
} from '@teamflow/shared/schemas';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireMember, RequirePermission } from '../permissions/permission.decorators';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query(new ZodValidationPipe(projectsQuerySchema)) query: ProjectsQuery,
  ) {
    return this.projects.list(user.id, query.archived ?? false);
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  create(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.projects.create(user.id, body);
  }

  @Get(':projectId')
  @RequireMember()
  get(@CurrentUser() user: { id: string }, @Param('projectId') projectId: string) {
    return this.projects.get(user.id, projectId);
  }

  @Patch(':projectId')
  @RequireMember()
  update(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ) {
    return this.projects.update(user.id, projectId, body);
  }

  @Delete(':projectId')
  @HttpCode(204)
  @RequirePermission('project:delete')
  async remove(@CurrentUser() user: { id: string }, @Param('projectId') projectId: string) {
    await this.projects.remove(user.id, projectId);
  }

  @Get(':projectId/board')
  @RequireMember()
  async board(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { board, truncated } = await this.projects.board(user.id, projectId);
    res.setHeader('X-Board-Truncated', truncated ? 'true' : 'false');
    return board;
  }
}
