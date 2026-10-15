import { useState } from "react";
import { Menu, LogOut, UserRoundCog, RefreshCw } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  onMenu: () => void;
}

export const Topbar = ({ onMenu }: Props) => {
  const { role } = useRole();
  const { user, logout, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const onRefreshSession = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const result = await refreshSession();
    if (result.ok) {
      toast.success("Session refreshed.");
    } else {
      toast.error(result.error);
      navigate("/login", { replace: true });
    }
    setIsRefreshing(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-muted-foreground hover:bg-secondary lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 max-w-[14rem] rounded-lg border border-border bg-card px-2 py-1.5 sm:max-w-none sm:w-[16.5rem] sm:px-3 sm:py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            {user?.name ?? "Guest"}
          </div>
          <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
            Role: {ROLE_LABELS[role]}
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void onRefreshSession()}
          disabled={isRefreshing}
          aria-label="Refresh session"
        >
          <RefreshCw className={isRefreshing ? "h-5 w-5 animate-spin" : "h-5 w-5"} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/profile")}
        >
          <UserRoundCog className="h-4 w-4" />
          <span className="hidden sm:inline">Profile</span>
        </Button>

        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void onLogout()}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>

        <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full gradient-primary text-sm font-semibold text-primary-foreground">
          CTC
        </div>
      </div>
    </header>
  );
};
