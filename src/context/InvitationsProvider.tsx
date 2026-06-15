"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

// Subscribes to incoming duel invitations and surfaces them as actionable
// toasts (Accept → join + navigate, Decline). Persistent table + realtime, so
// invites that arrived while away still show via the initial query. Renders no
// UI itself (toasts go through ToastProvider).
export function InvitationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const presentInvite = useCallback(
    async (inviteId: string, duelId: string, inviterId: string) => {
      const [{ data: prof }, { data: duel }] = await Promise.all([
        supabase.from("profiles").select("nickname, emoji").eq("id", inviterId).single(),
        supabase.from("duels").select("code, status").eq("id", duelId).single(),
      ]);
      // Ignore stale invites whose duel already started / vanished.
      if (!duel || duel.status !== "waiting") return;

      showToast({
        emoji: prof?.emoji ?? "⚔️",
        title: `${prof?.nickname ?? "Someone"} challenged you!`,
        body: "Duel invitation",
        actions: [
          {
            label: "Accept",
            primary: true,
            onClick: async () => {
              const { data: code } = await supabase.rpc("respond_duel_invite", {
                p_invite_id: inviteId,
                p_accept: true,
              });
              if (typeof code === "string" && code) router.push(`/duel/${code}`);
            },
          },
          {
            label: "Decline",
            onClick: async () => {
              await supabase.rpc("respond_duel_invite", {
                p_invite_id: inviteId,
                p_accept: false,
              });
            },
          },
        ],
      });
    },
    [supabase, showToast, router]
  );

  useEffect(() => {
    if (!user) return;

    async function loadPending() {
      const { data } = await supabase
        .from("duel_invitations")
        .select("id, duel_id, inviter")
        .eq("invitee", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      for (const inv of data ?? []) {
        presentInvite(inv.id, inv.duel_id, inv.inviter);
      }
    }

    const channel = supabase
      .channel(`invites-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "duel_invitations",
          filter: `invitee=eq.${user.id}`,
        },
        (payload) => {
          const r = payload.new as {
            id: string;
            duel_id: string;
            inviter: string;
            status: string;
          };
          if (r.status === "pending") presentInvite(r.id, r.duel_id, r.inviter);
        }
      )
      .subscribe((status) => {
        // Catch invites that arrived while we were away.
        if (status === "SUBSCRIBED") loadPending();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, presentInvite]);

  return <>{children}</>;
}
