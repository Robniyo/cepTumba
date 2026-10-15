import { AppRole } from '../auth-role.type';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};
