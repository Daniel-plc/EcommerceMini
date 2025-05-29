import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { migrateGuestCart, GUEST_CART_KEY } from '@/lib/cart-utils';
import { Session, User } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

// Ottieni l'URL di Supabase dalle variabili d'ambiente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

interface UseSupabaseAuth {
  session: Session | null;
  user: User | null;
  loading: boolean;
  sessionLoaded: boolean; // Flag per indicare che la sessione è stata caricata
  isTemporarySession: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSupabaseAuth = (): UseSupabaseAuth => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [isTemporarySession, setIsTemporarySession] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Controlla se esiste una sessione temporanea in sessionStorage
    const tempSessionCache = sessionStorage.getItem('sb_session');
    if (tempSessionCache) {
      try {
        const tempSession = JSON.parse(tempSessionCache);
        setSession(tempSession);
        setUser(tempSession?.user ?? null);
        setIsTemporarySession(true);
        setLoading(false);
        setSessionLoaded(true);
        
        // Imposta la sessione anche nel client Supabase
        supabase.auth.setSession(tempSession);
        return;
      } catch (error) {
        console.error('Errore nel ripristino della sessione temporanea:', error);
        // Se c'è un errore, rimuovi la sessione temporanea
        sessionStorage.removeItem('sb_session');
      }
    }
    
    // Recupera la sessione normale da Supabase se non c'è una sessione temporanea
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      setSessionLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Se l'evento è SIGNED_IN (include anche il login dopo SIGNED_UP)
      if (event === 'SIGNED_IN' && session?.user) {
        // Usa sempre sessione temporanea
        
        // Cancella i token di Supabase dal localStorage per forzare sessione temporanea
        localStorage.removeItem('sb-' + supabaseUrl + '-auth-token');
        
        // Salva la sessione in sessionStorage per la durata della sessione del browser
        sessionStorage.setItem('sb_session', JSON.stringify(session));
        
        // Imposta flag di sessione temporanea
        setIsTemporarySession(true);
        
        // Migra il carrello guest all'utente quando effettua il login
        migrateGuestCart(session.user.id);
        // Notifica aggiornamento carrello in modo esplicito
        const userCartKey = `cart_${session.user.id}`;
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey: userCartKey } }));
        
        // Controllo se è la prima volta che l'utente accede
        const hasSeenTour = localStorage.getItem('ordini-app-tour-completed');
        const isFirstLogin = localStorage.getItem('ordini-app-first-login');
        
        // Se non ha mai visto il tour e non è marcato come primo login
        if (!hasSeenTour && !isFirstLogin) {
          console.log(`[Supabase Auth] Evento auth: ${event} - Primo accesso rilevato`);
          // Segna che è un primo login
          localStorage.setItem('ordini-app-first-login', 'true');
          // Imposta il flag per avviare il tour
          localStorage.setItem('ordini-app-avvia-tour', 'true');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // Login con sessione temporanea
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      
      // Migra il carrello guest se c'è un utente
      if (data.user) {
        // Migra il carrello guest all'utente e notifica altri componenti
        migrateGuestCart(data.user.id);
        
        // Notifica aggiornamento carrello in modo esplicito per aggiornare navbar
        const userCartKey = `cart_${data.user.id}`;
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey: userCartKey } }));
        
        // Carrello utente aggiornato
      }
      
      // Usa sempre sessione temporanea per evitare problemi di condivisione carrello
      if (data.session) {
        // Configura sessione temporanea
        
        // Cancella i token di Supabase dal localStorage
        localStorage.removeItem('sb-' + supabaseUrl + '-auth-token');
        
        // Salva la sessione in sessionStorage per la durata della sessione del browser
        sessionStorage.setItem('sb_session', JSON.stringify(data.session));
        
        // Imposta flag di sessione temporanea
        setIsTemporarySession(true);
      }
      
      // Notifica il cambiamento di autenticazione
      window.dispatchEvent(new Event('authChange'));
      
      setSession(data.session);
      setUser(data.user);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore di accesso",
        description: error.message,
      });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });
      
      if (error) throw error;
      
      // Salva i flag per il tour guidato
      if (data.user) {
        localStorage.setItem('ordini-app-first-login', 'true');
        localStorage.setItem('ordini-app-avvia-tour', 'true');
        console.log('[Supabase Auth] Nuovo utente registrato - Flag tour impostati');
        
        toast({
          title: "Registrazione completata",
          description: "Il tuo account è stato creato con successo. Un tour guidato ti mostrerà le funzionalità dell'app.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore di registrazione",
        description: error.message,
      });
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Salva l'ID utente prima del logout per poter identificare correttamente il suo carrello
      let userId = null;
      if (user) {
        userId = user.id;
      }
      
      // Non rimuoviamo più il carrello al logout per preservare i prodotti dell'utente
      // tra le sessioni, come richiesto
      
      const { error } = await supabase.auth.signOut();
      
      // Rimuovi anche l'eventuale sessione temporanea
      sessionStorage.removeItem('sb_session');
      setIsTemporarySession(false);
      
      // Logout completato
      
      // Notifica il cambiamento di autenticazione
      window.dispatchEvent(new Event('authChange'));
      
      // Forza l'aggiornamento della navbar con il carrello guest
      window.dispatchEvent(new CustomEvent('cartUpdated', { 
        detail: { cartKey: GUEST_CART_KEY } 
      }));
      
      if (error) throw error;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore di disconnessione",
        description: error.message,
      });
      throw error;
    }
  };

  return {
    session,
    user,
    loading,
    sessionLoaded,
    isTemporarySession,
    signIn,
    signUp,
    signOut,
  };
};

interface UseSupabaseDB<T> {
  data: T[];
  error: Error | null;
  loading: boolean;
  fetch: () => Promise<void>;
}

export const useSupabaseQuery = <T>(
  tableName: string,
  options?: {
    column?: string;
    value?: string | number;
    select?: string;
  }
): UseSupabaseDB<T> => {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    try {
      setLoading(true);
      let query = supabase.from(tableName).select(options?.select || '*');
      
      if (options?.column && options?.value !== undefined) {
        query = query.eq(options.column, options.value);
      }
      
      const { data: result, error } = await query;
      
      if (error) throw error;
      
      setData(result as T[]);
    } catch (error: any) {
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [tableName, options?.column, options?.value, options?.select]);

  return { data, error, loading, fetch };
};