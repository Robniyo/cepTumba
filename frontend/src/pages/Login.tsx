import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Lock, Sparkles } from "lucide-react";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

const Login = () => {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const state = (location.state as LocationState | null) ?? null;
  const from = state?.from?.pathname ?? "/dashboard";

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    const result = await login(email, password);
    if (!result.ok) {
      setError("error" in result ? result.error : "Invalid email or password.");
      setIsSubmitting(false);
      return;
    }
    navigate(from, { replace: true });
    setIsSubmitting(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
      </div>
      <PublicHeader />

      <main className="relative px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-0 shadow-elevated gradient-hero text-primary-foreground">
              <CardContent className="p-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" /> FaithHub Access
                </div>
                <h1 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">
                  Welcome back to your association workspace
                </h1>
                <p className="mt-3 max-w-xl text-sm text-primary-foreground/85 sm:text-base">
                  Sign in with credentials created by your administrator to access your account.
                </p>
                <div className="mt-6 rounded-xl bg-primary-foreground/10 p-4 text-sm">
                  <div className="font-semibold">No account yet?</div>
                  <div className="mt-1 text-primary-foreground/90">Contact your association administrator to create your user account.</div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="text-2xl">Sign in</CardTitle>
                <CardDescription>Enter your account email and password.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@faithhub.test"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <div className="text-right">
                      <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full gap-2 gradient-primary text-primary-foreground border-0 hover:opacity-90">
                    <Lock className="h-4 w-4" /> {isSubmitting ? "Signing in..." : "Continue to dashboard"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
