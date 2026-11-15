import { useAuth } from "./useAuth";
import { useSpace } from "./useSpace";
import type { Profile } from "../lib/api";

/** The two people in the space, from the reader's point of view. Partner is null until they join. */
export function usePeople(): { me: Profile | null; partner: Profile | null; myId: string | null } {
  const { session } = useAuth();
  const { space, profile } = useSpace();
  const myId = session?.user.id ?? null;
  const members = space?.members ?? [];
  const me = members.find((m) => m.user_id === myId)?.profile ?? profile;
  const partner = members.find((m) => m.user_id !== myId)?.profile ?? null;
  return { me, partner, myId };
}
