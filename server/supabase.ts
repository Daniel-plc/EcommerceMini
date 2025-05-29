import { createClient } from '@supabase/supabase-js';

// Recupera le credenziali Supabase dalle variabili d'ambiente
// NOTA: le stesse variabili sono esposte anche al client come VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

// Verifica delle credenziali Supabase
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Mancano le variabili di ambiente per Supabase. Controlla VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

// Crea e esporta il client Supabase per uso lato server
export const supabase = createClient(supabaseUrl, supabaseAnonKey);