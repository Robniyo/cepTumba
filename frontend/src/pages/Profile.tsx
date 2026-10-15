import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/roles";
import { Heart, KeyRound, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { FamilyDetail, getMyFamily } from "@/data/familiesStore";

const Profile = () => {
  const { user, updateProfile, changePassword, accessToken, isReady } = useAuth();

  const [myFamily, setMyFamily] = useState<FamilyDetail | null>(null);
  const [isLoadingFamily, setIsLoadingFamily] = useState(true);

  useEffect(() => {
    if (!isReady || !accessToken) {
      setIsLoadingFamily(false);
      return;
    }
    let cancelled = false;
    setIsLoadingFamily(true);
    getMyFamily(accessToken)
      .then((data) => {
        if (!cancelled) setMyFamily(data);
      })
      .catch(() => {
        if (!cancelled) setMyFamily(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFamily(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady]);

  const [profileDraft, setProfileDraft] = useState({
    name: "",
    email: "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileDraft({
      name: user.name,
      email: user.email,
    });
  }, [user]);

  const hasProfileChanges = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      profileDraft.name.trim() !== user.name ||
      profileDraft.email.trim().toLowerCase() !== user.email.toLowerCase()
    );
  }, [profileDraft.email, profileDraft.name, user]);

  const onSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || isSavingProfile) {
      return;
    }

    const name = profileDraft.name.trim();
    const email = profileDraft.email.trim();

    if (name.length < 2) {
      toast.error("Display name must contain at least 2 characters.");
      return;
    }

    if (email.length === 0) {
      toast.error("Email is required.");
      return;
    }

    setIsSavingProfile(true);
    const result = await updateProfile({ name, email });
    setIsSavingProfile(false);

    if (!result.ok) {
      toast.error("error" in result ? result.error : "Failed to update profile.");
      return;
    }

    setProfileDraft({
      name: result.user.name,
      email: result.user.email,
    });
    toast.success("Profile information updated.");
  };

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (isSavingPassword) {
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Fill all password fields before saving.");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("New password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    setIsSavingPassword(true);
    const result = await changePassword(currentPassword, newPassword);
    setIsSavingPassword(false);

    if (!result.ok) {
      toast.error("error" in result ? result.error : "Failed to update password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password changed successfully.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        subtitle="Update your login information and keep your account secure."
      />

      <Card className="p-5 shadow-elegant">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">My Family</h2>
        </div>

        {isLoadingFamily ? (
          <div className="text-sm text-muted-foreground">Loading your family…</div>
        ) : !myFamily ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            You have not been assigned to a family yet. The VP-Social will place
            you during the next assignment round.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="font-display text-xl font-bold">{myFamily.familyName}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Code · {myFamily.familyCode}
                </div>
              </div>
              <Badge variant={myFamily.status === "active" ? "default" : "secondary"}>
                {myFamily.status}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Members" value={myFamily.totalMembers} />
              <Stat label="Brothers" value={myFamily.maleCount} />
              <Stat label="Sisters" value={myFamily.femaleCount} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ParentCard
                label="Daddy"
                name={myFamily.daddy?.fullName ?? null}
              />
              <ParentCard
                label="Mummy"
                name={myFamily.mummy?.fullName ?? null}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Heart className="h-4 w-4 text-primary" />
                Family members
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <ul className="divide-y">
                  {myFamily.members.map((m) => (
                    <li
                      key={m.membershipId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.memberStatus === "active"
                            ? (m.yearOfStudy?.trim() ? m.yearOfStudy : "N/A")
                            : (m.memberStatus ?? "N/A")}
                          {m.gender ? ` · ${m.gender}` : ""}
                        </div>
                      </div>
                      {m.roleInFamily !== "member" && (
                        <Badge variant="default" className="shrink-0 capitalize">
                          {m.roleInFamily}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 shadow-elegant">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Profile Information</h2>
          </div>

          <form className="space-y-4" onSubmit={onSaveProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={profileDraft.name}
                onChange={(event) =>
                  setProfileDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileDraft.email}
                onChange={(event) =>
                  setProfileDraft((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Current role: {ROLE_LABELS[user?.role ?? "member"]}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSavingProfile || !hasProfileChanges}
            >
              {isSavingProfile ? "Saving changes..." : "Save profile"}
            </Button>
          </form>
        </Card>

        <Card className="p-5 shadow-elegant">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Change Password</h2>
          </div>

          <form className="space-y-4" onSubmit={onChangePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSavingPassword}>
              {isSavingPassword ? "Updating password..." : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md border bg-muted/30 p-3">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 font-display text-lg font-bold">{value}</div>
  </div>
);

const ParentCard = ({ label, name }: { label: string; name: string | null }) => (
  <div className="rounded-md border p-3">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-sm font-medium">
      {name ?? <span className="text-muted-foreground">Not selected yet</span>}
    </div>
  </div>
);

export default Profile;
