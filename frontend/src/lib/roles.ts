export type Role =
  | "president"
  | "vp_prayers"
  | "vp_social"
  | "advisor_prayers"
  | "advisor_social"
  | "accountant"
  | "secretary"
  | "member";

export type AppSection =
  | "dashboard"
  | "members"
  | "announcements"
  | "contacts"
  | "minutes"
  | "leadership"
  | "alumni"
  | "devotion"
  | "prayer_center"
  | "events"
  | "welfare"
  | "requests"
  | "finance"
  | "families"
  | "messaging";

export type RolePermission =
  | "members.manage"
  | "announcements.publish"
  | "devotion.manage"
  | "devotion.review"
  | "prayer.follow_up"
  | "events.manage"
  | "events.attendance.manage"
  | "events.materials.manage"
  | "welfare.manage"
  | "welfare.review"
  | "requests.review.spiritual"
  | "requests.review.social"
  | "requests.review.financial"
  | "requests.review.admin"
  | "finance.manage"
  | "finance.approve"
  | "finance.view_sensitive"
  | "finance.view_reports"
  | "minutes.manage"
  | "minutes.review"
  | "documents.manage"
  | "leadership.manage"
  | "alumni.manage"
  | "families.manage"
  | "families.assign";

const ALL_ROLES: Role[] = [
  "president",
  "vp_prayers",
  "vp_social",
  "advisor_prayers",
  "advisor_social",
  "accountant",
  "secretary",
  "member",
];

export const SECTION_ROLES: Record<AppSection, Role[]> = {
  dashboard: ALL_ROLES,
  members: ["president", "secretary", "vp_social"],
  announcements: ALL_ROLES,
  contacts: ["president", "secretary"],
  minutes: ["president", "secretary", "advisor_prayers", "advisor_social"],
  leadership: ["president", "secretary"],
  alumni: ["president", "secretary", "vp_social", "advisor_social"],
  devotion: ALL_ROLES,
  prayer_center: ALL_ROLES,
  events: ALL_ROLES,
  welfare: ["president", "vp_social", "advisor_social", "secretary"],
  requests: [
    "president",
    "vp_prayers",
    "vp_social",
    "advisor_prayers",
    "advisor_social",
    "secretary",
    "member",
  ],
  finance: ["president", "accountant", "secretary", "member"],
  families: ["president", "vp_social", "advisor_social"],
  messaging: ALL_ROLES,
};

export const canAccessSection = (role: Role, section: AppSection) => SECTION_ROLES[section].includes(role);

const ROLE_PERMISSIONS: Record<Role, RolePermission[]> = {
  president: [
    "members.manage",
    "announcements.publish",
    "devotion.review",
    "prayer.follow_up",
    "events.manage",
    "welfare.review",
    "requests.review.spiritual",
    "requests.review.social",
    "requests.review.financial",
    "requests.review.admin",
    "finance.approve",
    "finance.view_sensitive",
    "finance.view_reports",
    "minutes.manage",
    "minutes.review",
    "documents.manage",
    "leadership.manage",
    "alumni.manage",
    "families.manage",
  ],
  vp_prayers: [
    "announcements.publish",
    "devotion.manage",
    "prayer.follow_up",
    "events.manage",
    "events.attendance.manage",
    "events.materials.manage",
    "requests.review.spiritual",
  ],
  vp_social: [
    "members.manage",
    "announcements.publish",
    "events.manage",
    "events.attendance.manage",
    "welfare.manage",
    "requests.review.social",
    "alumni.manage",
    "families.assign",
  ],
  advisor_prayers: [
    "announcements.publish",
    "devotion.review",
    "minutes.review",
    "requests.review.spiritual",
  ],
  advisor_social: [
    "announcements.publish",
    "minutes.review",
    "welfare.review",
    "requests.review.social",
  ],
  accountant: [
    "announcements.publish",
    "requests.review.financial",
    "finance.manage",
    "finance.approve",
    "finance.view_sensitive",
    "finance.view_reports",
  ],
  secretary: [
    "members.manage",
    "announcements.publish",
    "events.manage",
    "events.attendance.manage",
    "events.materials.manage",
    "requests.review.admin",
    "finance.view_reports",
    "minutes.manage",
    "documents.manage",
    "leadership.manage",
  ],
  member: [],
};

export const hasRolePermission = (role: Role, permission: RolePermission) =>
  ROLE_PERMISSIONS[role].includes(permission);

export const ROLE_LABELS: Record<Role, string> = {
  president: "President",
  vp_prayers: "VP – Prayers & Evangelism",
  vp_social: "VP – Social",
  advisor_prayers: "Advisor – Prayers",
  advisor_social: "Advisor – Social",
  accountant: "Accountant",
  secretary: "Secretary",
  member: "Member",
};

export const ROLE_SHORT: Record<Role, string> = {
  president: "President",
  vp_prayers: "VP Prayers",
  vp_social: "VP Social",
  advisor_prayers: "Advisor (P)",
  advisor_social: "Advisor (S)",
  accountant: "Accountant",
  secretary: "Secretary",
  member: "Member",
};
