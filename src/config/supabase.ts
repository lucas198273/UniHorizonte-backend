import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Cliente único do backend. Service-role: bypassa RLS,
// portanto TODO filtro de tenant é responsabilidade do repository.
export const supabase: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
