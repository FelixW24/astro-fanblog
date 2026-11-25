import { createServerClient } from './supabase';

export async function getNextMatch(now = new Date()) {
  const { data, error } = await createServerClient()
    .from('matches')
    .select('*')
    .eq('cancelled', false)
    .gt('kickoff_at', now.toISOString())
    .order('kickoff_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
