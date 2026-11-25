import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@teamflow/shared/permissions';

export const PERMISSION_KEY = 'requirePermission';
export const MEMBER_KEY = 'requireMember';

export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);

export const RequireMember = (): MethodDecorator & ClassDecorator => SetMetadata(MEMBER_KEY, true);
