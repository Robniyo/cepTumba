import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRole } from "@/context/RoleContext";
import { ROLE_LABELS, Role, hasRolePermission } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Devotion, getVerseOfTheDay } from "@/data/devotionStore";
import { AnnouncementRecord, listAnnouncements } from "@/data/announcementsStore";
import {
  Transaction,
  FUNDS,
  fundBalance,
  fmtRwf,
  totalIn,
  totalOut,
  isInPeriod,
  listTransactions,
} from "@/data/financeStore";
import { FamilyReportSummary, getFamilyReport } from "@/data/familiesStore";
import {
  FellowshipEvent,
  TYPE_META,
  eventsOnDate,
  formatISODate,
  listEvents,
} from "@/data/eventsStore";
import {
  PushSubscriptionStatus,
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscriptionStatus,
  isPushNotificationsPreferenceEnabled,
} from "@/lib/pushNotifications";
import {
  Users, Megaphone, Calendar, Wallet, HeartHandshake,
  TrendingUp, CheckCircle2, ArrowUpRight, ArrowDownRight, ClipboardList, Sparkles, BellRing, BellOff,
  Home,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const API_BASE_URL_RAW = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type DashboardMember = {
  id: string;
  fullName: string;
  status: "active" | "inactive" | "graduated" | "suspended";
  joinedAt: string | null;
  dateOfBirth: string | null;
};

const fetchMembersForDashboard = async (token: string): Promise<DashboardMember[]> => {
  const res = await fetch(`${API_BASE_URL_RAW}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load members.");
  const data = (await res.json()) as Array<{
    id: string;
    fullName: string;
    status: DashboardMember["status"];
    joinedAt: string | null;
    dateOfBirth: string | null;
  }>;
  return data.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    status: m.status,
    joinedAt: m.joinedAt,
    dateOfBirth: m.dateOfBirth,
  }));
};

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
};

const endOfWeek = (d: Date) => {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
};

const dayLabel = (d: Date) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];

const API_BASE_URL = API_BASE_URL_RAW;

const Dashboard = () => {
  const { accessToken, isReady } = useAuth();
  const { role } = useRole();
  const isMember = role === "member";
  const canViewFinanceReports = hasRolePermission(role, "finance.view_reports");
  const canViewFamilies = role === "president" || role === "vp_social" || role === "advisor_social";
  const canPublishAnnouncements = hasRolePermission(role, "announcements.publish");
  const [latestAnnouncements, setLatestAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [announcementsTotal, setAnnouncementsTotal] = useState(0);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);

  const [members, setMembers] = useState<DashboardMember[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [familyReport, setFamilyReport] = useState<FamilyReportSummary | null>(null);
  const [events, setEvents] = useState<FellowshipEvent[]>([]);
  const [verseOfTheDay, setVerseOfTheDay] = useState<Devotion | null>(null);

  const [pushPreferenceEnabled, setPushPreferenceEnabled] = useState(
    isPushNotificationsPreferenceEnabled(),
  );
  const [pushStatus, setPushStatus] = useState<PushSubscriptionStatus>({
    supported: false,
    permission: "unsupported",
    subscribed: false,
  });
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

  // Load members, transactions (if allowed), families report (if allowed)
  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const m = await fetchMembersForDashboard(accessToken);
        if (!cancelled) setMembers(m);
      } catch {
        if (!cancelled) setMembers([]);
      }
      if (canViewFinanceReports) {
        try {
          const res = await listTransactions(accessToken);
          if (!cancelled) setTransactions(res.items);
        } catch {
          if (!cancelled) setTransactions([]);
        }
      }
      if (canViewFamilies) {
        try {
          const fr = await getFamilyReport(accessToken);
          if (!cancelled) setFamilyReport(fr);
        } catch {
          if (!cancelled) setFamilyReport(null);
        }
      }
      try {
        const evts = await listEvents(accessToken);
        if (!cancelled) setEvents(evts);
      } catch {
        if (!cancelled) setEvents([]);
      }
      try {
        const verse = await getVerseOfTheDay(accessToken);
        if (!cancelled) setVerseOfTheDay(verse);
      } catch {
        if (!cancelled) setVerseOfTheDay(null);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, isReady, canViewFinanceReports, canViewFamilies]);

  // Compute this week's upcoming events (today + next 6 days)
  const weeklyUpcoming = useMemo(() => {
    const list: Array<FellowshipEvent & { occurrenceDate: Date }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      for (const e of eventsOnDate(events, d)) {
        list.push({ ...e, occurrenceDate: d });
      }
    }
    return list.slice(0, 5);
  }, [events]);

  // Derived values
  const totalMembers = members.length;
  const activeMembers = useMemo(() => members.filter(m => m.status === "active").length, [members]);

  const newThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const mm = now.getMonth();
    return members.filter(m => {
      if (!m.joinedAt) return false;
      const d = new Date(m.joinedAt);
      return d.getFullYear() === y && d.getMonth() === mm;
    }).length;
  }, [members]);

  // Finance derived
  const monthKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const monthTxs = useMemo(
    () => transactions.filter(t => isInPeriod(t.date, monthKey)),
    [transactions, monthKey],
  );
  const totalCash = useMemo(
    () => FUNDS.reduce((s, f) => s + Math.max(0, fundBalance(transactions, f.id)), 0),
    [transactions],
  );
  const monthIn = useMemo(() => totalIn(monthTxs), [monthTxs]);
  const monthOut = useMemo(() => totalOut(monthTxs), [monthTxs]);
  const pendingTxs = useMemo(
    () => transactions.filter(t => t.status === "pending"),
    [transactions],
  );
  const recentTxs = useMemo(
    () => [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5),
    [transactions],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!accessToken) {
      setLatestAnnouncements([]);
      setAnnouncementsTotal(0);
      setIsLoadingAnnouncements(false);
      return;
    }

    let cancelled = false;

    const loadAnnouncements = async () => {
      setIsLoadingAnnouncements(true);
      try {
        const response = await listAnnouncements(accessToken, { limit: 4 });
        if (!cancelled) {
          setLatestAnnouncements(response.items);
          setAnnouncementsTotal(response.total);
        }
      } catch {
        if (!cancelled) {
          setLatestAnnouncements([]);
          setAnnouncementsTotal(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAnnouncements(false);
        }
      }
    };

    void loadAnnouncements();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady]);

  useEffect(() => {
    if (!isReady || !accessToken) {
      return;
    }

    let cancelled = false;

    const loadPushStatus = async () => {
      const status = await getPushSubscriptionStatus();
      if (!cancelled) {
        setPushStatus(status);
        setPushPreferenceEnabled(isPushNotificationsPreferenceEnabled());
      }
    };

    void loadPushStatus();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isReady]);

  const togglePushNotifications = async (checked: boolean) => {
    if (!accessToken) {
      toast.error("Session token is missing. Please sign in again.");
      return;
    }

    if (isUpdatingPush) {
      return;
    }

    setIsUpdatingPush(true);
    try {
      if (checked) {
        const status = await enablePushNotifications(accessToken, API_BASE_URL);
        setPushPreferenceEnabled(true);
        setPushStatus(status);
        toast.success("Push notifications enabled for this device.");
      } else {
        const status = await disablePushNotifications(accessToken, API_BASE_URL);
        setPushPreferenceEnabled(false);
        setPushStatus(status);
        toast.success("Push notifications disabled for this device.");
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Unable to update push notification settings.";
      toast.error(message);

      const status = await getPushSubscriptionStatus();
      setPushStatus(status);
      setPushPreferenceEnabled(isPushNotificationsPreferenceEnabled());
    } finally {
      setIsUpdatingPush(false);
    }
  };

  const pushToggleChecked = pushPreferenceEnabled && pushStatus.subscribed;
  const pushStatusLabel = !pushStatus.supported
    ? "Push notifications are not supported in this browser."
    : pushStatus.permission === "denied"
      ? "Notifications are blocked in browser settings for this site."
      : pushToggleChecked
        ? "Enabled on this device."
        : "Disabled on this device.";

  const greeting = `Welcome, ${ROLE_LABELS[role]}`;
  const subtitle = isMember
    ? "See today's updates, verse, and upcoming events."
    : "Here's what's happening across the fellowship today.";

  return (
    <div className="space-y-6">
      <PageHeader title={greeting} subtitle={subtitle}>
        {!isMember && canPublishAnnouncements && (
          <>
            <Button variant="outline">Export report</Button>
            <Button className="gradient-primary text-primary-foreground border-0 hover:opacity-90" asChild>
              <Link to="/announcements">New announcement</Link>
            </Button>
          </>
        )}
      </PageHeader>

      <Card className="p-5 shadow-elegant">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {pushToggleChecked ? (
                <BellRing className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              <h3 className="font-display text-base font-bold">Notification Settings</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Control push alerts for announcement publishing and approval requests on this device.
            </p>
            <p className="text-xs text-muted-foreground">{pushStatusLabel}</p>
            <p className="text-xs text-muted-foreground">
              Email notifications are sent automatically by the backend when configured.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
            <span className="text-xs text-muted-foreground">Push alerts</span>
            <Switch
              checked={pushToggleChecked}
              onCheckedChange={(value) => void togglePushNotifications(value)}
              disabled={isUpdatingPush || !pushStatus.supported}
            />
          </div>
        </div>
      </Card>

      {/* Hero verse */}
      {verseOfTheDay && (
        <Card className="overflow-hidden border-0 shadow-elevated">
          <div className="gradient-hero p-6 sm:p-8 text-primary-foreground relative">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/30 blur-3xl" />
            <div className="absolute right-20 bottom-0 h-32 w-32 rounded-full bg-primary-glow/40 blur-2xl" />
            <div className="relative max-w-3xl">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary-foreground/80">
                <Sparkles className="h-3.5 w-3.5" /> Verse of the day · {format(new Date(verseOfTheDay.scheduledFor + 'T00:00:00'), "EEEE, MMM d")}
              </div>
              <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold leading-tight">
                "{verseOfTheDay.verse}"
              </h2>
              <div className="mt-2 text-accent font-semibold">— {verseOfTheDay.reference}</div>
              <p className="mt-4 text-sm sm:text-base text-primary-foreground/85 leading-relaxed">
                {verseOfTheDay.reflection}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* KPI grid - role aware */}
      <RoleStats
        role={role}
        announcementsTotal={announcementsTotal}
        totalMembers={totalMembers}
        activeMembers={activeMembers}
        newThisMonth={newThisMonth}
        totalCash={totalCash}
        monthIn={monthIn}
        monthOut={monthOut}
        pendingApprovalsCount={pendingTxs.length}
        familyReport={familyReport}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Announcements */}
        <Card className="lg:col-span-2 p-6 shadow-elegant">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-bold">Latest announcements</h3>
              <p className="text-sm text-muted-foreground">Pinned & recent updates</p>
            </div>
            <Button variant="ghost" size="sm" className="text-primary" asChild>
              <Link to="/announcements">View all</Link>
            </Button>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {isLoadingAnnouncements && (
              <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                Loading announcements...
              </div>
            )}

            {!isLoadingAnnouncements && latestAnnouncements.length === 0 && (
              <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                No announcements yet.
              </div>
            )}

            {!isLoadingAnnouncements && latestAnnouncements.map(a => (
              <div key={a.id} className="flex gap-3 rounded-lg border border-border/60 p-3 transition-base hover:bg-secondary/50">
                <CategoryDot category={a.category} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm truncate">{a.title}</h4>
                    {a.pinned && <Badge variant="secondary" className="h-5 text-[10px]">Pinned</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.body}</p>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {a.author} · {format(new Date(a.createdAt), "MMM d, h:mm a")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* This week — upcoming events for the next 7 days */}
        <Card className="p-6 shadow-elegant">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-bold">This week</h3>
              <p className="text-xs text-muted-foreground">Next 7 days</p>
            </div>
            <Button variant="ghost" size="sm" className="text-primary" asChild>
              <Link to="/events">View all</Link>
            </Button>
          </div>
          {weeklyUpcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              No upcoming events this week.
            </div>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {weeklyUpcoming.map(e => {
                const meta = TYPE_META[e.type];
                return (
                  <div key={`${e.id}-${formatISODate(e.occurrenceDate)}`} className="flex items-center gap-3">
                    <div className="flex h-11 w-11 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-[10px] font-medium uppercase">{dayLabel(e.occurrenceDate)}</span>
                      <span className="text-xs font-bold leading-none">{e.startTime.split(":")[0]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm truncate">{e.title}</div>
                        <Badge variant="outline" className={`h-5 text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {e.location} · {e.startTime}–{e.endTime}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Finance + side widgets */}
      {!isMember && (
        <div className="grid gap-6 lg:grid-cols-3">
          {canViewFinanceReports && (
            <Card className="lg:col-span-2 p-6 shadow-elegant">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold">Finance overview</h3>
                  <p className="text-sm text-muted-foreground">Approved transactions only</p>
                </div>
                <Button variant="ghost" size="sm" className="text-primary" asChild>
                  <Link to="/finance">View all</Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                {FUNDS.map(f => {
                  const balance = fundBalance(transactions, f.id);
                  return (
                    <div key={f.id} className="rounded-lg border border-border/60 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.name}</div>
                      <div className="mt-1 font-display text-lg font-bold">{fmtRwf(balance)}</div>
                    </div>
                  );
                })}
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Recent transactions</div>
                {recentTxs.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                    No transactions yet.
                  </div>
                )}
                {recentTxs.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-md py-2 px-3 hover:bg-secondary/60">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${t.direction === "in" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {t.direction === "in" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{t.description}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(t.date), "MMM d, yyyy")}</div>
                      </div>
                    </div>
                    <div className={`font-semibold text-sm ${t.direction === "in" ? "text-success" : "text-foreground"}`}>
                      {t.direction === "in" ? "+" : "-"}{fmtRwf(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="space-y-6">
            {canViewFinanceReports && (
              <Card className="p-6 shadow-elegant">
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Pending approvals
                </h3>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {pendingTxs.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      No pending transactions.
                    </div>
                  )}
                  {pendingTxs.slice(0, 5).map(p => (
                    <div key={p.id} className="rounded-md border border-border/60 p-3">
                      <div className="text-sm font-medium truncate">{p.description}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fmtRwf(p.amount)} · {format(new Date(p.date), "MMM d, yyyy")}
                      </div>
                      <div className="mt-2">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                          <Link to="/finance"><CheckCircle2 className="h-3 w-3 mr-1" /> Review</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}


          </div>
        </div>
      )}
    </div>
  );
};

const CategoryDot = ({ category }: { category: string }) => {
  const map: Record<string, string> = {
    urgent: "bg-destructive",
    spiritual: "bg-primary",
    finance: "bg-success",
    social: "bg-accent",
    academic: "bg-info",
    general: "bg-muted-foreground",
  };
  return <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${map[category]}`} />;
};

type RoleStatsProps = {
  role: Role;
  announcementsTotal: number;
  totalMembers: number;
  activeMembers: number;
  newThisMonth: number;
  totalCash: number;
  monthIn: number;
  monthOut: number;
  pendingApprovalsCount: number;
  familyReport: FamilyReportSummary | null;
};

const RoleStats = ({
  role,
  announcementsTotal,
  totalMembers,
  activeMembers,
  newThisMonth,
  totalCash,
  monthIn,
  monthOut,
  pendingApprovalsCount,
  familyReport,
}: RoleStatsProps) => {
  const member = role === "member";
  const finance = hasRolePermission(role, "finance.view_reports");
  const social = role === "vp_social" || role === "advisor_social";

  if (member) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Announcements" value={announcementsTotal} icon={Megaphone} variant="accent" trend="latest updates" />
        <StatCard label="Active members" value={activeMembers} icon={Users} variant="info" trend={`${totalMembers} total`} />
        <StatCard label="Welfare" value="Visit" icon={HeartHandshake} variant="success" trend="see resources" />
      </div>
    );
  }

  if (finance) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total cash" value={fmtRwf(totalCash)} icon={Wallet} variant="success" trend="across all funds" />
        <StatCard label="Income (month)" value={fmtRwf(monthIn)} icon={ArrowDownRight} variant="primary" />
        <StatCard label="Expenses (month)" value={fmtRwf(monthOut)} icon={ArrowUpRight} variant="accent" />
        <StatCard label="Pending approvals" value={pendingApprovalsCount} icon={ClipboardList} variant="info" />
      </div>
    );
  }

  if (social) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total members" value={totalMembers} icon={Users} variant="primary" trend={`${activeMembers} active`} />
        <StatCard
          label="Active families"
          value={familyReport?.totals.activeFamilies ?? 0}
          icon={Home}
          variant="info"
          trend={familyReport ? `${familyReport.totals.totalAssignedMembers} assigned` : undefined}
        />
        <StatCard label="New this month" value={newThisMonth} icon={TrendingUp} variant="success" />
      </div>
    );
  }

  // Default (president, advisor_prayers, vp_prayers, secretary)
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total members" value={totalMembers} icon={Users} variant="primary" trend={`${activeMembers} active`} />
      <StatCard label="New this month" value={newThisMonth} icon={TrendingUp} variant="success" />
      <StatCard label="Announcements" value={announcementsTotal} icon={Megaphone} variant="accent" trend="published" />
    </div>
  );
};

export default Dashboard;
