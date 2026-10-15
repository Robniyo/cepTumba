import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

  useEffect(() => {
    if (!token) {
      setInvalidToken(true);
      setError("Invalid or missing reset token. Please request a new password reset link.");
    }
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || invalidToken) return;

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string | string[] };
        const message = Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
        setError(message || "Failed to reset password");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (invalidToken) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        </div>

        <main className="relative px-4 py-10">
          <div className="mx-auto max-w-md">
            <Card className="shadow-elevated">
              <CardContent className="p-8">
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                  </div>
                </div>

                <h1 className="mt-6 text-center font-display text-2xl font-bold text-foreground">
                  Invalid reset link
                </h1>
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  {error}
                </p>

                <div className="mt-6 flex flex-col gap-3">
                  <Link to="/forgot-password" className="w-full">
                    <Button className="w-full gradient-primary text-primary-foreground border-0 hover:opacity-90">
                      Request new reset link
                    </Button>
                  </Link>
                  <Link to="/login" className="w-full">
                    <Button variant="outline" className="w-full">
                      Back to sign in
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        </div>

        <main className="relative px-4 py-10">
          <div className="mx-auto max-w-md">
            <Card className="shadow-elevated">
              <CardContent className="p-8">
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </div>

                <h1 className="mt-6 text-center font-display text-2xl font-bold text-foreground">
                  Password reset successful
                </h1>
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>

                <div className="mt-6">
                  <Link to="/login" className="w-full">
                    <Button className="w-full gradient-primary text-primary-foreground border-0 hover:opacity-90">
                      Continue to sign in
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
      </div>

      <main className="relative px-4 py-10">
        <div className="mx-auto max-w-md">
          <Link to="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            ← Back to sign in
          </Link>

          <Card className="mt-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="text-2xl">Reset your password</CardTitle>
              <CardDescription>Enter your new password below.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter your new password"
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    required
                    minLength={6}
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full gap-2 gradient-primary text-primary-foreground border-0 hover:opacity-90" disabled={isSubmitting}>
                  <Lock className="h-4 w-4" /> {isSubmitting ? "Resetting..." : "Reset password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
