import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { UserRow } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: UserRow | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  fetchUser: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,

  setSession: (session) => {
    set({ session, loading: false });
  },

  fetchUser: async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      set({ user: data as UserRow });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
