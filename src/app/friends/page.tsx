"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useFriends, type OnlineFriend } from "@/context/FriendsProvider";
import {
  searchUsers,
  challengeFriend,
  type FriendEntry,
  type UserResult,
} from "@/lib/supabase/friends";
import {
  getFriendsDuelRanking,
  type RankingEntry,
} from "@/lib/supabase/duel-stats";

type Relation =
  | { kind: "friend" | "outgoing" | "none" }
  | { kind: "incoming"; friendshipId: string };

export default function FriendsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { friends, incoming, outgoing, loading, sendRequest, respondRequest, unfriend } =
    useFriends();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    getFriendsDuelRanking().then(setRanking);
  }, [user, friends.length]);

  async function handleChallenge(friendId: string) {
    setChallengingId(friendId);
    const code = await challengeFriend(friendId);
    if (code) router.push(`/duel/${code}`);
    else setChallengingId(null);
  }

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Debounced user search.
  useEffect(() => {
    const q = query.trim();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!user || q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(async () => {
      const r = await searchUsers(q, user.id);
      setResults(r);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, user]);

  function relationFor(userId: string): Relation {
    if (friends.some((f) => f.id === userId)) return { kind: "friend" };
    const inc = incoming.find((r) => r.id === userId);
    if (inc) return { kind: "incoming", friendshipId: inc.friendshipId };
    if (outgoing.some((r) => r.id === userId)) return { kind: "outgoing" };
    return { kind: "none" };
  }

  if (authLoading || !user) {
    return (
      <main className="pop-bg min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500" />
      </main>
    );
  }

  const trimmed = query.trim();

  return (
    <main className="pop-bg min-h-screen text-[#fafaf9]">
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
        >
          ← Back
        </Link>

        <h1 className="font-display text-3xl font-extrabold tracking-tight mt-6 mb-8 flex items-center gap-2">
          <span>👥</span> Friends
        </h1>

        {/* Search users */}
        <div className="relative mb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players by nickname"
            className="input-pop text-sm"
          />
        </div>

        {/* Search results */}
        {trimmed.length > 0 && (
          <div className="mb-8 space-y-1.5">
            {searching && results.length === 0 ? (
              <p className="text-neutral-600 text-sm py-3">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-neutral-600 text-sm py-3">
                No players found for “{trimmed}”.
              </p>
            ) : (
              results.map((u) => {
                const rel = relationFor(u.id);
                return (
                  <Row key={u.id} emoji={u.emoji} nickname={u.nickname}>
                    {rel.kind === "friend" && (
                      <span className="text-xs text-emerald-400 font-medium px-2">
                        ✓ Friends
                      </span>
                    )}
                    {rel.kind === "outgoing" && (
                      <span className="text-xs text-neutral-500 px-2">Pending</span>
                    )}
                    {rel.kind === "incoming" && (
                      <button
                        onClick={() => respondRequest(rel.friendshipId, true)}
                        className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#06281c] px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                      >
                        Accept request
                      </button>
                    )}
                    {rel.kind === "none" && (
                      <button
                        onClick={() => sendRequest(u.nickname)}
                        className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#06281c] px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    )}
                  </Row>
                );
              })
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Incoming requests */}
            {incoming.length > 0 && (
              <Section title={`Requests (${incoming.length})`}>
                {incoming.map((r) => (
                  <Row key={r.friendshipId} emoji={r.emoji} nickname={r.nickname}>
                    <button
                      onClick={() => respondRequest(r.friendshipId, true)}
                      className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#06281c] px-3 py-1.5 rounded-full transition-colors cursor-pointer"
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
                  No friends yet. Search for a player above to add them.
                </p>
              ) : (
                friends.map((f: OnlineFriend) => (
                  <Row key={f.friendshipId} emoji={f.emoji} nickname={f.nickname} online={f.online}>
                    {f.online && (
                      <button
                        onClick={() => handleChallenge(f.id)}
                        disabled={challengingId === f.id}
                        className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#06281c] px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                      >
                        {challengingId === f.id ? "..." : "⚔️ Challenge"}
                      </button>
                    )}
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
                {outgoing.map((r: FriendEntry) => (
                  <Row key={r.friendshipId} emoji={r.emoji} nickname={r.nickname} muted>
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

            {/* Friends ranking (by duel ELO) */}
            {ranking.length > 1 && (
              <Section title="Ranking">
                {ranking.map((r, i) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${
                      r.isMe
                        ? "bg-cyan-500/15 border border-cyan-400/30"
                        : "bg-white/5"
                    }`}
                  >
                    <span className="text-sm font-bold w-5 text-center text-neutral-400">
                      {["🥇", "🥈", "🥉"][i] ?? i + 1}
                    </span>
                    <span className="text-lg">{r.emoji}</span>
                    <span
                      className={`flex-1 min-w-0 text-sm font-medium truncate ${
                        r.isMe ? "text-cyan-300" : "text-neutral-300"
                      }`}
                    >
                      {r.nickname}
                      {r.isMe && <span className="text-[10px] text-cyan-600 ml-1.5">you</span>}
                    </span>
                    <span className="text-[11px] text-neutral-600 tabular-nums">
                      {r.wins}W·{r.losses}L
                    </span>
                    <span className="text-sm font-bold text-cyan-400 tabular-nums w-12 text-right">
                      {r.rating}
                    </span>
                  </div>
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
      <h2 className="font-display text-lg font-extrabold text-white mb-3">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  emoji,
  nickname,
  online,
  muted,
  children,
}: {
  emoji: string;
  nickname: string;
  online?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
        muted ? "bg-white/[0.03]" : "bg-white/5"
      }`}
    >
      <span className="text-xl">{emoji}</span>
      <span className="flex-1 min-w-0 text-sm font-medium text-neutral-200 truncate">
        {nickname}
      </span>
      {online !== undefined && (
        <span className="flex items-center gap-1.5 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400" : "bg-neutral-700"}`}
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
