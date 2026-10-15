import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { Role } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";

type RoleContextValue = {
  role: Role;
  setRole: (r: Role) => void;
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [role, setRole] = useState<Role>("president");
  const effectiveRole = user?.role ?? role;
  const value = useMemo(() => ({ role: effectiveRole, setRole }), [effectiveRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
};
