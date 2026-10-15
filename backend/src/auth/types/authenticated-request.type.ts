import { Request } from 'express';
import { AuthTokenPayload } from './auth-token-payload.type';

export type AuthenticatedRequest = Request & {
  user?: AuthTokenPayload;
};
