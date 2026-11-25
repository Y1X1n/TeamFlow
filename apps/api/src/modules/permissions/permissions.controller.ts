import { Controller, Get, Req } from '@nestjs/common';
import { PERMISSIONS, ROLE_PRESETS } from '@teamflow/shared/permissions';
import type { Request } from 'express';
import { DomainError } from '../../common/domain-error';
import { RequireMember } from './permission.decorators';

@Controller()
export class PermissionsController {
  @Get('permissions/catalog')
  catalog() {
    return {
      actions: PERMISSIONS.map((permission) => ({
        key: permission.key,
        label: permission.label,
        group: permission.group,
        description: permission.description,
      })),
      rolePresets: ROLE_PRESETS,
    };
  }

  @Get('projects/:projectId/permissions/me')
  @RequireMember()
  myPermissions(@Req() req: Request) {
    const access = req.projectAccess;
    if (!access) throw new DomainError('NOT_FOUND', 404, 'Project not found');
    return {
      projectId: access.projectId,
      role: access.role,
      permissions: access.permissions,
      overrides: access.overrides,
      archived: access.archived,
    };
  }
}
