import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export const PublicHeader = () => {
  const { isAuthenticated } = useAuth();

  return (
    <header className="relative border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo-cep.png"
            alt="CEP Tumba logo"
            className="h-11 w-11 rounded-lg object-cover shadow-glow"
          />
          <div>
            <div className="font-display text-base font-bold leading-none">CEP Tumba College</div>
            <div className="text-[11px] text-muted-foreground">Association Management Platform</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          )}
          <Button asChild className="gradient-primary border-0 text-primary-foreground hover:opacity-90">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
};
