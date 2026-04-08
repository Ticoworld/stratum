export const MEMBER_ROLES = ["owner", "analyst", "viewer"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
