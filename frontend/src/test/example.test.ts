import { describe, expect, it } from "vitest";
import {
  AppSection,
  Role,
  RolePermission,
  SECTION_ROLES,
  canAccessSection,
  hasRolePermission,
} from "@/lib/roles";

const EXPECTED_SECTION_ROLES: Record<AppSection, Role[]> = {
  dashboard: ["president", "vp_prayers", "vp_social", "advisor_prayers", "advisor_social", "accountant", "secretary", "member"],
  members: ["president", "secretary", "vp_social"],
  announcements: ["president", "vp_prayers", "vp_social", "advisor_prayers", "advisor_social", "accountant", "secretary", "member"],
  minutes: ["president", "secretary", "advisor_prayers", "advisor_social"],
  leadership: ["president", "secretary"],
  alumni: ["president", "secretary", "vp_social", "advisor_social"],
  devotion: ["president", "vp_prayers", "vp_social", "advisor_prayers", "advisor_social", "accountant", "secretary", "member"],
  prayer_center: ["president", "vp_prayers", "vp_social", "advisor_prayers", "advisor_social", "accountant", "secretary", "member"],
  events: ["president", "vp_prayers", "vp_social", "advisor_prayers", "advisor_social", "accountant", "secretary", "member"],
  welfare: ["president", "vp_social", "advisor_social", "secretary"],
  requests: ["president", "vp_prayers", "vp_social", "advisor_prayers", "advisor_social", "secretary", "member"],
  finance: ["president", "accountant", "secretary", "member"],
  families: ["president", "vp_social", "advisor_social"],
};

const ALL_PERMISSIONS: RolePermission[] = [
  "members.manage",
  "announcements.publish",
  "devotion.manage",
  "devotion.review",
  "prayer.follow_up",
  "events.manage",
  "events.attendance.manage",
  "events.materials.manage",
  "welfare.manage",
  "welfare.review",
  "requests.review.spiritual",
  "requests.review.social",
  "requests.review.financial",
  "requests.review.admin",
  "finance.manage",
  "finance.approve",
  "finance.view_sensitive",
  "finance.view_reports",
  "minutes.manage",
  "minutes.review",
  "documents.manage",
  "leadership.manage",
  "alumni.manage",
  "families.manage",
  "families.assign",
];

const EXPECTED_ROLE_PERMISSIONS: Record<Role, RolePermission[]> = {
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
    "announcements.publish",
    "events.manage",
    "events.attendance.manage",
    "welfare.manage",
    "requests.review.social",
    "alumni.manage",
    "families.assign",
  ],
  advisor_prayers: ["announcements.publish", "devotion.review", "minutes.review", "requests.review.spiritual"],
  advisor_social: ["announcements.publish", "minutes.review", "welfare.review", "requests.review.social"],
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

describe("authorization matrix", () => {
  it("enforces exact section visibility by role", () => {
    expect(SECTION_ROLES).toEqual(EXPECTED_SECTION_ROLES);
  });

  it("enforces exact action permissions by role", () => {
    for (const role of ALL_ROLES) {
      const expected = new Set(EXPECTED_ROLE_PERMISSIONS[role]);

      for (const permission of ALL_PERMISSIONS) {
        expect(hasRolePermission(role, permission)).toBe(expected.has(permission));
      }
    }
  });

  it("keeps member scope strictly self-service", () => {
    const memberSections = (Object.keys(EXPECTED_SECTION_ROLES) as AppSection[]).filter((section) =>
      canAccessSection("member", section),
    );

    expect(memberSections).toEqual([
      "dashboard",
      "announcements",
      "devotion",
      "prayer_center",
      "events",
      "requests",
      "finance",
    ]);

    for (const permission of ALL_PERMISSIONS) {
      expect(hasRolePermission("member", permission)).toBe(false);
    }
  });

  it("preserves domain-scoped request approvals", () => {
    expect(hasRolePermission("vp_prayers", "requests.review.spiritual")).toBe(true);
    expect(hasRolePermission("vp_prayers", "requests.review.social")).toBe(false);
    expect(hasRolePermission("vp_prayers", "requests.review.financial")).toBe(false);
    expect(hasRolePermission("vp_prayers", "requests.review.admin")).toBe(false);

    expect(hasRolePermission("vp_social", "requests.review.social")).toBe(true);
    expect(hasRolePermission("vp_social", "requests.review.spiritual")).toBe(false);
    expect(hasRolePermission("vp_social", "requests.review.financial")).toBe(false);
    expect(hasRolePermission("vp_social", "requests.review.admin")).toBe(false);

    expect(hasRolePermission("accountant", "requests.review.financial")).toBe(true);
    expect(hasRolePermission("accountant", "requests.review.social")).toBe(false);
    expect(hasRolePermission("accountant", "requests.review.spiritual")).toBe(false);
    expect(hasRolePermission("accountant", "requests.review.admin")).toBe(false);

    expect(hasRolePermission("secretary", "requests.review.admin")).toBe(true);
    expect(hasRolePermission("secretary", "requests.review.spiritual")).toBe(false);
    expect(hasRolePermission("secretary", "requests.review.social")).toBe(false);
    expect(hasRolePermission("secretary", "requests.review.financial")).toBe(false);
  });
});
