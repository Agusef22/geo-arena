"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function UserMenu() {
  const { user, profile, loading, signOut } = useAuth();
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
        className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400 hover:text-emerald-400 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <span className="text-xl">{profile.emoji}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400 hidden sm:inline">
          {profile.nickname}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Profile header */}
          <div className="px-4 py-3 border-b border-zinc-800">
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
              href="/profile/edit"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-neutral-300 hover:bg-zinc-800 transition-colors"
            >
              Edit profile
            </Link>
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
