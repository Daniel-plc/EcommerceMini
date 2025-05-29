import { supabase } from './supabase';
import logger from './logger';

// Logger specifico per i helper di autenticazione
const authLogger = logger.createLogger('AuthHelpers');

/**
 * Funzione per estrarre parametri dall'URL (query e hash)
 * Implementa una strategia speciale per rilevare errori nella URL di Supabase
 */
export function getUrlParams() {
  authLogger.debug('Analisi URL:', window.location.href);
  
  // METODO SPECIALE: Rileva errori direttamente nella URL completa
  // Questa è la prima cosa da controllare poiché Supabase può incorporare i parametri
  // di errore direttamente nella URL in vari formati
  const url = window.location.href;
  const errorParams = new Map<string, string>();
  
  // Controlla i codici di errore comuni nella URL completa
  if (url.includes('error_code=access_denied')) {
    errorParams.set('error_code', 'access_denied');
    authLogger.info('Rilevato error_code=access_denied nella URL');
  }
  
  if (url.includes('error_description=')) {
    // Estrai il valore di error_description
    const match = url.match(/error_description=([^&]+)/);
    if (match && match[1]) {
      try {
        const description = decodeURIComponent(match[1]);
        errorParams.set('error_description', description);
        authLogger.info('Rilevato error_description nella URL:', description);
      } catch (e) {
        authLogger.error('Errore durante il decoding di error_description:', e);
      }
    }
  }
  
  // Se abbiamo trovato errori diretti nella URL, diamo loro la priorità massima
  if (errorParams.size > 0) {
    return errorParams;
  }
  
  // METODO STANDARD: Estrai parametri dalle varie parti dell'URL
  // Controlla sia nella query string che nel hash fragment
  const queryParams = new URLSearchParams(window.location.search);
  
  // Estrai il hash fragment (potrebbe contenere una query string dopo #)
  const hashFragment = window.location.hash;
  let hashParams = new URLSearchParams();
  
  if (hashFragment) {
    // Rimuovi il # iniziale
    let hashContent = hashFragment.substring(1);
    
    // Supporta sia formati con parametri espliciti (e.g., #key=value&key2=value2)
    // che formati con un singolo valore (e.g., #error_message)
    if (hashContent.includes('=')) {
      hashParams = new URLSearchParams(hashContent);
    } else {
      // Se è un singolo valore, considera come error message generico
      hashParams = new URLSearchParams(`error=${hashContent}`);
    }
  }
  
  // Unifica i parametri da tutte le fonti 
  // Priorità: query string > hash params
  const params = new Map<string, string>();
  
  // Aggiungi parametri dal hash (priorità più bassa)
  hashParams.forEach((value, key) => {
    if (value) params.set(key, value);
  });
  
  // Aggiungi/sostituisci parametri dalla query string (priorità alta)
  queryParams.forEach((value, key) => {
    if (value) params.set(key, value);
  });
  
  // Debug
  authLogger.debug('Parametri estratti:',  
    '\nQuery:', Object.fromEntries(queryParams), 
    '\nHash:', Object.fromEntries(hashParams),
    '\nUnificati:', Object.fromEntries(params));
  
  return params;
}

/**
 * Controlla se l'URL contiene parametri di errore di Supabase o errori generici
 */
export function hasSupabaseError(): boolean {
  const url = window.location.href;
  
  // Controlla direttamente la presenza di errori comuni nell'URL
  if (url.includes('error_code=') || 
      url.includes('error_description=') || 
      url.includes('access_denied') ||
      url.includes('#error=') ||
      url.includes('?error=')) {
    return true;
  }
  
  // Controlla anche i parametri estratti
  const params = getUrlParams();
  return params.has('error_code') || params.has('error_description') || params.has('error');
}

/**
 * Ottiene il messaggio di errore dall'URL
 */
export function getErrorMessage(): string | null {
  const params = getUrlParams();
  
  // Controlla prima error_description di Supabase
  if (params.has('error_description')) {
    return decodeURIComponent(params.get('error_description')!);
  }
  
  // Controlla error_code di Supabase
  if (params.has('error_code')) {
    const errorCode = params.get('error_code');
    
    // Fornisci messaggi più descrittivi per codici di errore comuni
    switch (errorCode) {
      case 'access_denied':
        return 'Accesso negato. La richiesta non è stata autorizzata.';
      case 'expired_token':
        return 'Il link è scaduto. Richiedi un nuovo link.';
      case 'invalid_token':
        return 'Link non valido. Richiedi un nuovo link.';
      default:
        return `Errore (${errorCode}). Riprova o contatta l'assistenza.`;
    }
  }
  
  // Controlla parametro di errore generico
  if (params.has('error')) {
    return decodeURIComponent(params.get('error')!);
  }
  
  return null;
}

/**
 * Ottiene l'email dall'URL o dall'utente corrente
 */
export async function getEmailFromUrlOrUser(): Promise<string | null> {
  const params = getUrlParams();
  
  // Prova prima nell'URL
  if (params.has('email')) {
    return decodeURIComponent(params.get('email')!);
  }
  
  // Altrimenti prova a ottenere l'utente corrente
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || null;
  } catch (error) {
    authLogger.error('Errore nel recupero dell\'utente:', error);
    return null;
  }
}

/**
 * Maschera l'email per la visualizzazione
 * Mantiene primo e ultimo carattere del local-part, sostituendo il resto con "*"
 */
export function maskEmail(email: string): string {
  if (!email) return '';
  
  const [local, domain] = email.split('@');
  if (!local || local.length <= 2 || !domain) return email;
  
  const first = local[0];
  const last = local[local.length - 1];
  const stars = '*'.repeat(local.length - 2);
  
  return `${first}${stars}${last}@${domain}`;
}