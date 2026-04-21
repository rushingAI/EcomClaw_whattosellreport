"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type UserProfile = {
  id: string;
  email: string;
  plan: string;
  quota_remaining: number;
  quota_total: number;
};

export type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
};

export function useAuth() {
  // useMemo 保证 supabase 实例稳定，避免每次渲染重建导致 useEffect 无限触发
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  });

  const fetchProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, plan, quota_remaining, quota_total")
        .eq("id", userId)
        .single();
      return data as UserProfile | null;
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }: { data: { user: User | null } }) => {
      const profile = user ? await fetchProfile(user.id) : null;
      setState({ user, profile, loading: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: import("@supabase/supabase-js").Session | null) => {
        const user = session?.user ?? null;
        const profile = user ? await fetchProfile(user.id) : null;
        setState({ user, profile, loading: false });
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const profile = await fetchProfile(user.id);
    setState((prev) => ({ ...prev, profile }));
  }, [supabase, fetchProfile]);

  return { ...state, signIn, signUp, signOut, getAccessToken, refreshProfile };
}
