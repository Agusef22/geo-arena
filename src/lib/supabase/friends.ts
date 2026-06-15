import { createClient } from "./client";

// One entry in a friend list / request list. `id` is the OTHER user's profile
// id; `friendshipId` is the friendships row (used to respond / unfriend).
export interface FriendEntry {
  friendshipId: string;
  id: string;
  nickname: string;
  emoji: string;
}

export interface FriendData {
  friends: FriendEntry[];
  incoming: FriendEntry[]; // requests sent TO me — I can accept/decline
  outgoing: FriendEntry[]; // requests I sent — pending
}

interface FriendshipRow {
  id: string;
  user_low: string;
  user_high: string;
  requester: string;
  status: string;
}

const EMPTY: FriendData = { friends: [], incoming: [], outgoing: [] };

/**
 * Load the caller's friendships and resolve the other party's profile into
 * friends / incoming-requests / outgoing-requests buckets.
 */
export async function loadFriendData(myId: string): Promise<FriendData> {
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("friendships")
    .select("id, user_low, user_high, requester, status");
  if (!rows || rows.length === 0) return EMPTY;

  const other = (r: FriendshipRow) => (r.user_low === myId ? r.user_high : r.user_low);
  const ids = [...new Set((rows as FriendshipRow[]).map(other))];

  const profileById = new Map<string, { nickname: string; emoji: string }>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, nickname, emoji")
      .in("id", ids);
    for (const p of profs ?? []) profileById.set(p.id, p);
  }

  const friends: FriendEntry[] = [];
  const incoming: FriendEntry[] = [];
  const outgoing: FriendEntry[] = [];

  for (const r of rows as FriendshipRow[]) {
    const otherId = other(r);
    const prof = profileById.get(otherId);
    if (!prof) continue;
    const entry: FriendEntry = {
      friendshipId: r.id,
      id: otherId,
      nickname: prof.nickname,
      emoji: prof.emoji,
    };
    if (r.status === "accepted") friends.push(entry);
    else if (r.requester === myId) outgoing.push(entry);
    else incoming.push(entry);
  }

  friends.sort((a, b) => a.nickname.localeCompare(b.nickname));
  return { friends, incoming, outgoing };
}

/** Send (or auto-accept) a friend request by the target's unique nickname. */
export async function sendFriendRequest(
  nickname: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("send_friend_request", {
    p_nickname: nickname,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Accept (true) or decline (false) an incoming request. */
export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc("respond_friend_request", {
    p_id: friendshipId,
    p_accept: accept,
  });
  return !error;
}

/** Remove a friendship (or cancel an outgoing request) — plain RLS-gated delete. */
export async function unfriend(friendshipId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  return !error;
}
