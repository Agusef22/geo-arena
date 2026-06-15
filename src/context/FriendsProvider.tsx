"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { usePresence } from "./PresenceProvider";
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
