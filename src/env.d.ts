/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface SessionData {
    recovery?: import('./lib/auth-security').EmailProof;
    recoveryApproval?: import('./lib/auth-security').RecoveryApproval;
    confirmation?: import('./lib/auth-security').EmailProof;
  }
  interface Locals {
    supabase?: import('@supabase/supabase-js').SupabaseClient<
      import('./lib/database.types').Database
    >;
    readerUser?: import('@supabase/supabase-js').User | null;
    /** Serverseitig erkannter Datensparmodus (Cookie oder Save-Data-Header). */
    dataSaver?: boolean;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly EDITOR_AUTH_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
