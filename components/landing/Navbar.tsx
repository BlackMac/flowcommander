"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setIsLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  };

  return (
    <div className="navbar absolute top-0 left-0 right-0 z-20 px-6">
      <div className="flex-1">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <img
            src="/img/logo.svg"
            alt="FlowCommander"
            className="w-7 h-7"
            style={{ filter: "invert(36%) sepia(85%) saturate(2046%) hue-rotate(238deg) brightness(87%) contrast(93%)" }}
          />
          FlowCommander
        </Link>
      </div>
      <div className="flex-none flex items-center gap-2">
        {isLoading ? (
          <div className="w-20 h-8 bg-base-300/50 rounded animate-pulse" />
        ) : user ? (
          <>
            <Link href="/projects" className="btn btn-ghost btn-sm">
              My Projects
            </Link>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
