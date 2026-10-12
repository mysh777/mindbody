import { createClient } from '@supabase/supabase-js';
import { createRequestTracker } from './requestTracker';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const requestTracker = createRequestTracker();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: requestTracker.fetch },
});
