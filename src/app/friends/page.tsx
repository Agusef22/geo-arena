"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useFriends, type OnlineFriend } from "@/context/FriendsProvider";
import type { FriendEntry } from "@/lib/supabase/friends";

export default function FriendsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { friends, incoming, outgoing, loading, sendRequest, respondRequest, unfriend } =
    useFriends();

  const [nick, setNick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nick.trim();
    if (trimmed.length < 2) return;
    setSending(true);
    setMsg(null);
    const res = await sendRequest(trimmed);
    setSending(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Request sent to ${trimmed}` });
      setNick("");
    } else {
      setMsg({ ok: false, text: friendlyError(res.error) });
    }
  }

  if (authLoading || !user) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#fafaf9]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500 hover:text-emerald-400 transition-colors"
        >
          ← Back
        </Link>

        <h1 className="font-display text-3xl font-extrabold tracking-tight mt-6 mb-8">
          Friends
        </h1>

        {/* Add friend */}
        <form onSubmit={handleAdd} className="mb-2">
          <div className="flex gap-2">
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Add a friend by nickname"
              className="flex-1 bg-neutral-900 border border-neutral-800 focus:border-emerald-700 outline-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 transition-colors"
            />
            <button
              type="submit"
              disabled={sending || nick.trim().length < 2}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 active:scale-95 text-[#0a0a0a] font-semibold px-5 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {sending ? "..." : "Add"}
            </button>
          </div>
        </form>
        {msg && (
          <p className={`text-xs mb-6 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {msg.text}
          </p>
        )}
        {!msg && <div className="mb-6" />}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-neutral-900/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Incoming requests */}
            {incoming.length > 0 && (
              <Section title={`Requests (${incoming.length})`}>
                {incoming.map((r) => (
                  <Row key={r.friendshipId} entry={r}>
                    <button
                      onClick={() => respondRequest(r.friendshipId, true)}
                      className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#0a0a0a] px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondRequest(r.friendshipId, false)}
                      className="text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                    >
                      Decline
                    </button>
                  </Row>
                ))}
              </Section>
            )}

            {/* Friends */}
            <Section title={`Friends (${friends.length})`}>
              {friends.length === 0 ? (
                <p className="text-neutral-600 text-sm py-4">
                  No friends yet. Add someone by their nickname above.
                </p>
              ) : (
                friends.map((f) => (
                  <Row key={f.friendshipId} entry={f} online={f.online}>
                    <button
                      onClick={() => unfriend(f.friendshipId)}
                      className="text-xs font-medium text-neutral-500 hover:text-red-400 px-2 py-1.5 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </Row>
                ))
              )}
            </Section>

            {/* Outgoing */}
            {outgoing.length > 0 && (
              <Section title={`Sent (${outgoing.length})`}>
                {outgoing.map((r) => (
                  <Row key={r.friendshipId} entry={r} muted>
                    <span className="text-[11px] text-neutral-600 mr-1">pending</span>
                    <button
                      onClick={() => unfriend(r.friendshipId)}
                      className="text-xs font-medium text-neutral-500 hover:text-red-400 px-2 py-1.5 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </Row>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-emerald-400">↳</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          {title}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  entry,
  online,
  muted,
  children,
}: {
  entry: OnlineFriend | FriendEntry;
  online?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
        muted ? "bg-neutral-900/30" : "bg-neutral-900/50"
      }`}
    >
      <span className="text-xl">{entry.emoji}</span>
      <span className="flex-1 min-w-0 text-sm font-medium text-neutral-200 truncate">
        {entry.nickname}
      </span>
      {online !== undefined && (
        <span className="flex items-center gap-1.5 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              online ? "bg-emerald-400" : "bg-neutral-700"
            }`}
          />
          <span className={online ? "text-emerald-400" : "text-neutral-600"}>
            {online ? "online" : "offline"}
          </span>
        </span>
      )}
      <div className="flex items-center gap-1 shrink-0">{children}</div>
    </div>
  );
}

function friendlyError(error?: string): string {
  if (!error) return "Something went wrong";
  if (error.includes("user not found")) return "No player with that nickname";
  if (error.includes("already friends")) return "You're already friends";
  if (error.includes("request already sent")) return "Request already sent";
  if (error.includes("cannot add yourself")) return "That's you!";
  return error;
}
