"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthContext";
import { usePresence } from "./PresenceProvider";
import { useToast } from "./ToastContext";
import {
  loadFriendData,
  sendFriendRequest,
  respondFriendRequest,
  unfriend as unfriendApi,
  type FriendData,
  type FriendEntry,
} from "@/lib/supabase/friends";

export interface OnlineFriend extends FriendEntry {
  online: boolean;
}

interface FriendsState {
  friends: OnlineFriend[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  sendRequest: (nickname: string) => Promise<{ ok: boolean; error?: string }>;
  respondRequest: (friendshipId: string, accept: boolean) => Promise<void>;
  unfriend: (friendshipId: string) => Promise<void>;
}

const noop = async () => {};

const FriendsContext = createContext<FriendsState>({
  friends: [],
  incoming: [],
  outgoing: [],
  loading: true,
  refresh: noop,
  sendRequest: async () => ({ ok: false }),
  respondRequest: noop,
  unfriend: noop,
});

const EMPTY: FriendData = { friends: [], incoming: [], outgoing: [] };

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { onlineUserIds } = usePresence();
  const { showToast } = useToast();
  const [supabase] = useState(() => createClient());
  const [data, setData] = useState<FriendData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    const d = await loadFriendData(user.id);
    setData(d);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Live updates: refresh whenever one of my friendships changes, and toast on
  // a new incoming request. Realtime RLS only delivers rows I'm a member of.
  const onFriendshipChange = useCallback(
    async (payload: {
      eventType: string;
      new: Record<string, unknown>;
    }) => {
      refresh();
      if (!user || payload.eventType !== "INSERT") return;

      const row = payload.new as {
        id: string;
        user_low: string;
        user_high: string;
        requester: string;
        status: string;
      };
      const incomingToMe =
        row.status === "pending" &&
        row.requester !== user.id &&
        (row.user_low === user.id || row.user_high === user.id);
      if (!incomingToMe) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("nickname, emoji")
        .eq("id", row.requester)
        .single();

      showToast({
        emoji: prof?.emoji ?? "👋",
        title: `${prof?.nickname ?? "Someone"} sent you a friend request`,
        actions: [
          {
            label: "Accept",
            primary: true,
            onClick: async () => {
              await respondFriendRequest(row.id, true);
              await refresh();
            },
          },
          {
            label: "Decline",
            onClick: async () => {
              await respondFriendRequest(row.id, false);
              await refresh();
            },
          },
        ],
      });
    },
    [user, supabase, showToast, refresh]
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`friendships-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        onFriendshipChange
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, onFriendshipChange]);

  const sendRequest = useCallback(
    async (nickname: string) => {
      const res = await sendFriendRequest(nickname.trim());
      if (res.ok) await refresh();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    [refresh]
  );

  const respondRequest = useCallback(
    async (friendshipId: string, accept: boolean) => {
      await respondFriendRequest(friendshipId, accept);
      await refresh();
    },
    [refresh]
  );

  const unfriend = useCallback(
    async (friendshipId: string) => {
      await unfriendApi(friendshipId);
      await refresh();
    },
    [refresh]
  );

  const friends: OnlineFriend[] = data.friends.map((f) => ({
    ...f,
    online: onlineUserIds.has(f.id),
  }));

  return (
    <FriendsContext.Provider
      value={{
        friends,
        incoming: data.incoming,
        outgoing: data.outgoing,
        loading,
        refresh,
        sendRequest,
        respondRequest,
        unfriend,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  return useContext(FriendsContext);
}
