"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useFriends } from "@/context/FriendsProvider";

export default function UserMenu() {
  const { user, profile, loading, signOut } = useAuth();
  const { incoming } = useFriends();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
    );
  }

  if (!user || !profile) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-1.5 text-sm font-semibold text-white transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/10 pl-1.5 pr-3 py-1.5 transition-colors cursor-pointer"
      >
        <span className="text-xl">{profile.emoji}</span>
        {incoming.length > 0 && (
          <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-pink-400 ring-2 ring-[#0e0b1e]" />
        )}
        <span className="text-sm font-semibold text-neutral-200 hidden sm:inline">
          {profile.nickname}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 surface-pop shadow-2xl overflow-hidden z-50">
          {/* Profile header */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{profile.emoji}</span>
              <div>
                <p className="text-sm font-medium text-white">
                  {profile.nickname}
                </p>
                <p className="text-[11px] text-neutral-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <Link
              href="/friends"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5 transition-colors"
            >
              <span>Friends</span>
              {incoming.length > 0 && (
                <span className="bg-emerald-500 text-[#0a0a0a] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {incoming.length}
                </span>
              )}
            </Link>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5 transition-colors"
            >
              Profile &amp; history
            </Link>
            <Link
              href="/profile/edit"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5 transition-colors"
            >
              Edit profile
            </Link>
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
