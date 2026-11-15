import { supabase } from "./supabase";

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  free_from: string | null; // "HH:MM:SS" local time
  free_to: string | null;
  // "Our Story" — individual profile (all optional; activities fall back to general wording)
  current_city: string | null;
  current_country: string | null;
  home_country: string | null;
  institution: string | null;
  situation: string | null;
  interests: string[];
  languages_spoken: string[];
  languages_learning: string[];
  sharing_now: string;
}

export const PROFILE_COLUMNS =
  "id, display_name, timezone, free_from, free_to, current_city, current_country, home_country, institution, situation, interests, languages_spoken, languages_learning, sharing_now";

export type ProfilePatch = Partial<Omit<Profile, "id">>;

export interface Relationship {
  id: string;
  name: string;
  status: "pending" | "active";
  created_by: string;
  created_at: string;
  activated_at: string | null;
  include_just_us_weekly: boolean;
}

export interface Member {
  user_id: string;
  role: "creator" | "partner";
  joined_at: string;
  profile: Profile | null;
}

export interface OpenInvitation {
  id: string;
  expires_at: string;
}

export interface Space {
  relationship: Relationship;
  members: Member[];
  openInvitation: OpenInvitation | null;
}

/** Throws the Supabase error object so callers can pass it to friendlyError(). */
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  return check(await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle());
}

export async function updateMyProfile(userId: string, patch: Partial<Pick<Profile, "display_name" | "timezone" | "free_from" | "free_to">>) {
  check(await supabase.from("profiles").update(patch).eq("id", userId));
}

/** Either partner can edit either profile ("both edit everything"); the server whitelists fields. */
export async function updateMemberProfile(userId: string, patch: ProfilePatch) {
  check(await supabase.rpc("update_member_profile", { p_user: userId, p_patch: patch }));
}

/** The caller's space, or null if they haven't created or joined one. RLS limits every query to their own data. */
export async function getMySpace(userId: string): Promise<Space | null> {
  const mine = check(
    await supabase.from("relationship_members").select("relationship_id").eq("user_id", userId).eq("status", "active").maybeSingle(),
  );
  if (!mine) return null;
  const relId = mine.relationship_id as string;

  const [rel, members, invites] = await Promise.all([
    supabase.from("relationships").select("id, name, status, created_by, created_at, activated_at, include_just_us_weekly").eq("id", relId).single(),
    supabase.from("relationship_members").select("user_id, role, joined_at").eq("relationship_id", relId).eq("status", "active").order("joined_at"),
    supabase
      .from("invitations")
      .select("id, expires_at")
      .eq("relationship_id", relId)
      .is("redeemed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const relationship = check(rel) as Relationship;
  const memberRows = check(members) as Omit<Member, "profile">[];
  const inviteRows = check(invites) as OpenInvitation[];

  const profiles = check(
    await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", memberRows.map((m) => m.user_id)),
  ) as Profile[];

  return {
    relationship,
    members: memberRows.map((m) => ({ ...m, profile: profiles.find((p) => p.id === m.user_id) ?? null })),
    openInvitation: inviteRows[0] ?? null,
  };
}

export async function createRelationship(name: string): Promise<string> {
  return check(await supabase.rpc("create_relationship", { p_name: name || null })) as string;
}

export async function createInvitation(): Promise<{ token: string; expires_at: string }> {
  const rows = check(await supabase.rpc("create_invitation")) as { token: string; expires_at: string }[];
  if (!rows?.[0]) throw new Error("We couldn't create a link. Please try again.");
  return rows[0];
}

export async function revokeInvitations(): Promise<void> {
  check(await supabase.rpc("revoke_invitations"));
}

export async function previewInvitation(token: string) {
  const rows = check(await supabase.rpc("preview_invitation", { p_token: token })) as {
    relationship_name: string; inviter_name: string; expires_at: string;
  }[];
  return rows?.[0] ?? null;
}

export async function acceptInvitation(token: string): Promise<string> {
  return check(await supabase.rpc("accept_invitation", { p_token: token })) as string;
}

export async function renameRelationship(name: string): Promise<void> {
  check(await supabase.rpc("rename_relationship", { p_name: name }));
}
