"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthContext";

interface PresenceState {
  onlineUserIds: Set<string>;
}

const PresenceContext = createContext<PresenceState>({
  onlineUserIds: new Set(),
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [supabase] = useState(() => createClient());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnlineUserIds(new Set());
      return;
    }

    // A single global presence channel that every signed-in user joins. The
    // presence key is the user id, so presenceState() is keyed by user id and
    // its keys are exactly who's online. O(N) fan-out — fine for now; at scale
    // shard the channel or switch to a last_seen heartbeat column.
    const channel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    const sync = () => {
      setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  return (
    <PresenceContext.Provider value={{ onlineUserIds }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
