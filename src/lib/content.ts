import { currentLoan, type CurrentLoan } from './player-availability';
import type { Database } from './database.types';
import { createServerClient } from './supabase';

export const categories = [
  {
    slug: 'spielbericht-analyse',
    label: 'Spielberichte',
    short: 'Analyse',
  },
  { slug: 'news', label: 'News', short: 'News' },
  {
    slug: 'pk-zusammenfassung',
    label: 'Pressekonferenzen',
    short: 'PK kompakt',
  },
  { slug: 'transfer', label: 'Transfers', short: 'Transfers' },
  { slug: 'weiteres', label: 'Weiteres', short: 'Jeföhl' },
] as const;

export type CategorySlug = (typeof categories)[number]['slug'];
export type Article = Database['public']['Tables']['articles']['Row'];
export type Player = Database['public']['Tables']['players']['Row'];
export type PlayerChart = Database['public']['Tables']['player_charts']['Row'];
export type Loan = CurrentLoan;

export function categoryMeta(slug: string) {
  return categories.find((category) => category.slug === slug) ?? categories[4];
}

export function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

export async function getArticles(
  options: { category?: string; limit?: number } = {},
) {
  const supabase = createServerClient();
  let query = supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  if (options.category) query = query.eq('category', options.category);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getFeaturedArticle() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .eq('is_featured', true)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getArticle(slug: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getSquad() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .in('squad_status', ['first-team', 'loan-in'])
    .order('shirt_number', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data;
}

export async function getPlayer(slug: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('players')
    .select('*, loans(*)')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPlayerCharts(playerId: number) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('player_charts')
    .select('*')
    .eq('player_id', playerId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getLoans() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('players')
    .select('*, loans(*)')
    .in('squad_status', ['loan-in', 'on-loan'])
    .order('name');
  if (error) throw error;
  return (data ?? [])
    .map(currentLoan)
    .filter((loan): loan is CurrentLoan => loan !== null);
}

export async function getLoanByPlayerSlug(slug: string) {
  const player = await getPlayer(slug);
  return player ? currentLoan(player) : null;
}
