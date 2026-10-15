import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRole } from "@/context/RoleContext";
import { Role } from "@/lib/roles";

export const RequireRoles = ({ roles, children }: { roles: Role[]; children: ReactNode }) => {
  const { role } = useRole();
  if (!roles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};
