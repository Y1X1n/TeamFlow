import type { AuthenticatedUser, ProjectAccessContext } from '../common/auth.types';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user: AuthenticatedUser;
      projectAccess?: ProjectAccessContext;
    }
  }
}

export {};
