import { useEffect, useMemo, useState, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { useAuth } from "@/context/AuthContext";
import { AppSection, canAccessSection } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Devotion, getVerseOfTheDay } from "@/data/devotionStore";

type LinkItem = {
  to: string;
  label: string;
  end?: boolean;
  section: AppSection;
};

type NavGroup = {
  title: string;
  icon: ComponentType<{ className?: string }>;
  links: LinkItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    icon: LayoutDashboard,
    links: [{ to: "/dashboard", label: "Dashboard", end: true, section: "dashboard" }],
  },
  {
    title: "Administration",
    icon: FileText,
    links: [
      { to: "/members", label: "Members", section: "members" },
      { to: "/announcements", label: "Announcements", section: "announcements" },
      { to: "/contacts", label: "Contact Submissions", section: "contacts" },
      { to: "/minutes", label: "Minutes & Docs", section: "minutes" },
      { to: "/leadership", label: "Leadership", section: "leadership" },
      { to: "/alumni", label: "Alumni", section: "alumni" },
    ],
  },
  {
    title: "Spiritual Life",
    icon: BookOpen,
    links: [
      { to: "/devotion", label: "Devotion", section: "devotion" },
      { to: "/prayer-center", label: "Prayer Center", section: "prayer_center" },
      { to: "/events", label: "Events", section: "events" },
    ],
  },
  {
    title: "Community",
    icon: Users,
    links: [
      { to: "/families", label: "Families", section: "families" },
      { to: "/messages", label: "Messages", section: "messaging" },
    ],
  },
  {
    title: "Welfare & Support",
    icon: HeartHandshake,
    links: [
      { to: "/welfare", label: "Welfare", section: "welfare" },
      { to: "/requests", label: "Requests & Approvals", section: "requests" },
    ],
  },
  {
    title: "Finance",
    icon: Wallet,
    links: [
      { to: "/finance", label: "Finance Hub", section: "finance" },
      { to: "/savings-requests", label: "Savings Requests", section: "finance" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const Sidebar = ({ open, onClose }: Props) => {
  const location = useLocation();
  const { role } = useRole();
  const { accessToken, isReady } = useAuth();
  const [openGroupTitle, setOpenGroupTitle] = useState<string | null>(null);
  const [verseOfTheDay, setVerseOfTheDay] = useState<Devotion | null>(null);

  useEffect(() => {
    if (!isReady || !accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const devotion = await getVerseOfTheDay(accessToken);
        if (!cancelled) setVerseOfTheDay(devotion);
      } catch {
        if (!cancelled) setVerseOfTheDay(null);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, isReady]);

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          links: group.links.filter((link) => canAccessSection(role, link.section)),
        }))
        .filter((group) => group.links.length > 0),
    [role],
  );

  const activeGroupTitle = useMemo(
    () =>
      visibleGroups.find((group) =>
        group.links.some(({ to, end }) =>
          end
            ? location.pathname === to
            : location.pathname === to || location.pathname.startsWith(`${to}/`),
        ),
      )?.title,
    [location.pathname, visibleGroups],
  );

  useEffect(() => {
    if (!activeGroupTitle) return;
    setOpenGroupTitle(activeGroupTitle);
  }, [activeGroupTitle]);

  const toggleGroup = (title: string) => {
    setOpenGroupTitle((prev) => (prev === title ? null : title));
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-cep.png"
              alt="CEP Tumba logo"
              className="h-11 w-11 rounded-lg object-cover"
            />
            <div>
              <div className="font-display text-lg font-bold leading-none">CEP Tumba College</div>
              <div className="mt-0.5 text-[11px] text-sidebar-foreground/60">Association System</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              const isOpen = openGroupTitle ? openGroupTitle === group.title : group.title === activeGroupTitle;

              return (
                <div key={group.title}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={isOpen}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/65 transition-base",
                      "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <GroupIcon className="h-3.5 w-3.5" />
                    <span className="flex-1">{group.title}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-300",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-out",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div
                        className={cn(
                          "ml-4 space-y-1 border-l border-sidebar-border/70 pl-2 pt-1 transition-transform duration-300",
                          isOpen ? "translate-y-0" : "-translate-y-1",
                        )}
                      >
                        {group.links.map(({ to, label, end }, index) => (
                          <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={onClose}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-[13px] font-medium transition-all duration-300",
                                isOpen ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
                                isActive
                                  ? "bg-sidebar-primary/15 text-sidebar-foreground"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                              )
                            }
                            style={{ transitionDelay: isOpen ? `${index * 35}ms` : "0ms" }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full border border-sidebar-foreground/35" />
                            <span>{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {verseOfTheDay && (
          <div className="m-3 rounded-xl bg-sidebar-accent p-4">
            <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">Verse of the day</div>
            <div className="mt-1 font-display text-sm font-semibold">{verseOfTheDay.reference}</div>
            <div className="mt-1 text-xs leading-relaxed text-sidebar-foreground/75 line-clamp-4">
              "{verseOfTheDay.verse}"
            </div>
          </div>
        )}
      </aside>
    </>
  );
};