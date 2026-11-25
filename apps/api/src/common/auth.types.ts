import type { Permission, PermissionOverrides } from '@teamflow/shared/permissions';
import type { ProjectRole } from '@teamflow/shared/enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface ProjectAccessContext {
  projectId: string;
  role: ProjectRole;
  permissions: Permission[];
  overrides: PermissionOverrides | null;
  archived: boolean;
}
