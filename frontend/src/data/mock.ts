export type Member = {
  id: string;
  memberNo: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  yearOfStudy: string;
  fellowship: string;
  status: "active" | "inactive" | "graduated" | "suspended";
  joinedAt: string;
  baptized: boolean;
  avatarHue: number;
};

export const members: Member[] = [
  { id: "m1", memberNo: "CTC-0001", fullName: "Grace Mwangi", email: "grace.m@uni.edu", phone: "+254 712 334 110", department: "Computer Science", yearOfStudy: "Y3", fellowship: "Mt. Zion Cell", status: "active", joinedAt: "2023-09-12", baptized: true, avatarHue: 12 },
  { id: "m2", memberNo: "CTC-0002", fullName: "Daniel Otieno", email: "daniel.o@uni.edu", phone: "+254 720 998 221", department: "Business", yearOfStudy: "Y2", fellowship: "Bethel Cell", status: "active", joinedAt: "2024-01-22", baptized: true, avatarHue: 200 },
  { id: "m3", memberNo: "CTC-0003", fullName: "Esther Wanjiru", email: "esther.w@uni.edu", phone: "+254 733 445 882", department: "Education", yearOfStudy: "Y4", fellowship: "Hebron Cell", status: "active", joinedAt: "2022-08-30", baptized: true, avatarHue: 320 },
  { id: "m4", memberNo: "CTC-0004", fullName: "Brian Kiptoo", email: "brian.k@uni.edu", phone: "+254 701 776 554", department: "Engineering", yearOfStudy: "Y1", fellowship: "Mt. Zion Cell", status: "active", joinedAt: "2025-02-14", baptized: false, avatarHue: 90 },
  { id: "m5", memberNo: "CTC-0005", fullName: "Mercy Akinyi", email: "mercy.a@uni.edu", phone: "+254 715 223 990", department: "Nursing", yearOfStudy: "Y3", fellowship: "Bethel Cell", status: "inactive", joinedAt: "2023-03-05", baptized: true, avatarHue: 260 },
  { id: "m6", memberNo: "CTC-0006", fullName: "Samuel Njoroge", email: "samuel.n@uni.edu", phone: "+254 728 117 663", department: "Law", yearOfStudy: "Y4", fellowship: "Hebron Cell", status: "graduated", joinedAt: "2021-09-18", baptized: true, avatarHue: 30 },
  { id: "m7", memberNo: "CTC-0007", fullName: "Lydia Chebet", email: "lydia.c@uni.edu", phone: "+254 740 882 117", department: "Pharmacy", yearOfStudy: "Y2", fellowship: "Mt. Zion Cell", status: "active", joinedAt: "2024-09-01", baptized: false, avatarHue: 350 },
  { id: "m8", memberNo: "CTC-0008", fullName: "Kevin Mutua", email: "kevin.m@uni.edu", phone: "+254 711 552 008", department: "Finance", yearOfStudy: "Y3", fellowship: "Bethel Cell", status: "active", joinedAt: "2023-10-10", baptized: true, avatarHue: 170 },
];

export type Announcement = {
  id: string;
  title: string;
  body: string;
  category: "urgent" | "spiritual" | "finance" | "social" | "academic" | "general";
  author: string;
  createdAt: string;
  pinned?: boolean;
};

export const announcements: Announcement[] = [
  { id: "a1", title: "Friday All-Night Prayer", body: "Join us this Friday from 9pm at the main hall as we seek God's face together. Theme: 'Reset & Refire'.", category: "spiritual", author: "VP Prayers", createdAt: "2026-04-17T08:00:00Z", pinned: true },
  { id: "a2", title: "Semester Welfare Contributions", body: "Kindly clear your welfare contribution of Rwf 200 by end of week. M-Pesa till in member portal.", category: "finance", author: "Accountant", createdAt: "2026-04-16T14:30:00Z" },
  { id: "a3", title: "URGENT: Hall Change for Sunday", body: "Sunday service moves to LT3 due to hall maintenance. Same time, 9:30am.", category: "urgent", author: "Secretary", createdAt: "2026-04-18T07:15:00Z", pinned: true },
  { id: "a4", title: "Hospital Visit – Sister Mercy", body: "We are organising a visit on Saturday afternoon. Sign up with the social desk.", category: "social", author: "VP Social", createdAt: "2026-04-15T11:00:00Z" },
  { id: "a5", title: "Mid-Semester Exam Prayer", body: "Special prayer session for those sitting CATs next week. Tuesday 6pm.", category: "academic", author: "VP Prayers", createdAt: "2026-04-14T17:45:00Z" },
  { id: "a6", title: "Constitution Review Meeting", body: "Leaders meeting Thursday 7pm to review proposed amendments. Agenda shared.", category: "general", author: "President", createdAt: "2026-04-13T09:00:00Z" },
];

export type EventItem = {
  id: string;
  title: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  time: string;
  location: string;
  type: "prayer" | "study" | "service" | "social" | "outreach" | "meeting";
};

export const weeklyEvents: EventItem[] = [
  { id: "e1", title: "Morning Prayer", day: "Mon", time: "06:00", location: "Chapel", type: "prayer" },
  { id: "e2", title: "Bible Study", day: "Wed", time: "18:00", location: "LT2", type: "study" },
  { id: "e3", title: "Choir Rehearsal", day: "Fri", time: "17:00", location: "Music Room", type: "meeting" },
  { id: "e4", title: "Evangelism Outreach", day: "Sat", time: "09:00", location: "Town Sq.", type: "outreach" },
  { id: "e5", title: "Sunday Service", day: "Sun", time: "09:30", location: "Main Hall", type: "service" },
  { id: "e6", title: "Welfare Visit", day: "Sat", time: "15:00", location: "Hospital", type: "social" },
];

export type DailyVerse = {
  date: string;
  reference: string;
  text: string;
  reflection: string;
};

export const todayVerse: DailyVerse = {
  date: new Date().toISOString(),
  reference: "Philippians 4:13",
  text: "I can do all things through Christ who strengthens me.",
  reflection: "Whatever lies ahead today — exams, leadership, uncertainty — your strength is renewed in Him. Walk boldly.",
};

export const financeSummary = {
  totalSavings: 184500,
  monthIncome: 42300,
  monthExpense: 18750,
  pendingApprovals: 3,
  funds: [
    { name: "Welfare", balance: 56200, color: "success" as const },
    { name: "Evangelism", balance: 38400, color: "primary" as const },
    { name: "Social", balance: 21900, color: "accent" as const },
    { name: "Project", balance: 68000, color: "info" as const },
  ],
  recent: [
    { id: "t1", date: "2026-04-18", desc: "Sunday offering", type: "in" as const, amount: 8400 },
    { id: "t2", date: "2026-04-17", desc: "Welfare – sister Mercy", type: "out" as const, amount: 3500 },
    { id: "t3", date: "2026-04-16", desc: "Member savings (12 members)", type: "in" as const, amount: 12000 },
    { id: "t4", date: "2026-04-15", desc: "Evangelism transport", type: "out" as const, amount: 2200 },
  ],
};

export const stats = {
  totalMembers: members.length,
  activeMembers: members.filter(m => m.status === "active").length,
  newThisMonth: 4,
  attendanceRate: 78,
  pendingApprovals: 5,
  upcomingEvents: weeklyEvents.length,
  prayerRequests: 9,
  welfareCases: 3,
};
