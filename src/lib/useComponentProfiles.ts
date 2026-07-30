import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { useAuth } from './AuthContext';

// Named, reusable component profiles (Motor, Battery; Cable/Inverter are the
// same shape as a future `type`) that get pulled into MULTIPLE calculators —
// distinct from useSavedCalculations, which snapshots one calculator's full
// input set. See component_profiles in supabase/migration.sql.

export type ComponentProfileType = 'motor' | 'battery';

export interface ComponentProfile<TParams = Record<string, unknown>> {
  id: string;
  type: ComponentProfileType;
  label: string;
  params: TParams;
  updated_at: string;
}

export function useComponentProfiles<TParams = Record<string, unknown>>(type: ComponentProfileType) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ComponentProfile<TParams>[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;
    setLoading(true);
    const { data } = await supabase
      .from('component_profiles')
      .select('id, type, label, params, updated_at')
      .eq('type', type)
      .order('updated_at', { ascending: false });
    setProfiles((data as ComponentProfile<TParams>[] | null) ?? []);
    setLoading(false);
  }, [user, type]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async (label: string, params: TParams): Promise<{ error: string | null; id?: string }> => {
    if (!isSupabaseConfigured) return { error: 'Saving is not configured (Supabase environment variables are missing).' };
    if (!user) return { error: 'You need to be signed in to save a profile.' };
    const { data, error } = await supabase
      .from('component_profiles')
      .insert({ user_id: user.id, type, label, params })
      .select('id')
      .single();
    if (error) return { error: error.message };
    await refresh();
    return { error: null, id: (data as { id: string } | null)?.id };
  };

  const update = async (id: string, label: string, params: TParams): Promise<{ error: string | null }> => {
    if (!user || !isSupabaseConfigured) return { error: 'You need to be signed in to update a profile.' };
    const { error } = await supabase.from('component_profiles').update({ label, params, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  };

  const remove = async (id: string) => {
    if (!user || !isSupabaseConfigured) return;
    await supabase.from('component_profiles').delete().eq('id', id);
    await refresh();
  };

  return { profiles, loading, save, update, remove, loggedIn: !!user, refresh };
}
