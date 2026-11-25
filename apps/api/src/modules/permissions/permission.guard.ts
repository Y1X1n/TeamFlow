import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@teamflow/shared/permissions';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth.types';
import { DomainError } from '../../common/domain-error';
import { AccessService } from './access.service';
import { MEMBER_KEY, PERMISSION_KEY } from './permission.decorators';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const memberRequired = this.reflector.getAllAndOverride<boolean | undefined>(MEMBER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action && !memberRequired) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new DomainError('UNAUTHORIZED', 401, 'Authentication required');

    const projectId = await this.access.resolveProjectId(
      request.params as Record<string, string | undefined>,
    );
    if (!projectId) throw new DomainError('NOT_FOUND', 404, 'Project not found');

    const access = await this.access.getContext(user.id, projectId);
    if (action && request.method !== 'GET' && access.archived) {
      throw new DomainError('PROJECT_ARCHIVED', 409, 'Project is archived');
    }
    if (action && !access.permissions.includes(action)) {
      throw new DomainError('FORBIDDEN', 403, `Missing permission ${action}`);
    }
    request.projectAccess = access;
    return true;
  }
}
