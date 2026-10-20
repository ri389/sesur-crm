import { PermissionScope } from '@prisma/client';
import { Request } from 'express';

export interface PermissionGrant {
  resource: string;
  action: string;
  scope: PermissionScope;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  roles: string[];
  permissions: PermissionGrant[];
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
}

export function requestContext(req: Request): RequestContext {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 512),
  };
}
