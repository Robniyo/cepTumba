import { AppRole } from '../auth-role.type';

export type TokenKind = 'access' | 'refresh';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: AppRole;
  kind: TokenKind;
  iat?: number;
  exp?: number;
};
