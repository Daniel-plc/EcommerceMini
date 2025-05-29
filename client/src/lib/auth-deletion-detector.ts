/**
 * Detector di eliminazione account
 * Implementazione diretta che verifica gli errori di API e forza il logout
 * Questo approccio si basa sull'intercettazione di errori specifici di Supabase
 */
import { supabase } from './supabase';
import logger from './logger';

// Logger specifico per il rilevamento dell'eliminazione dell'account
const deletionLogger = logger.createLogger('DeletionDetector');

// Flag per tenere traccia se l'utente è già stato forzato al logout
let forcedLogoutTriggered = false;

/**
 * Configura un interceptor globale per rilevare errori di API
 * che indicano che l'account è stato eliminato
 */
export function setupDeletionDetector() {
  // Proxy originale fetch
  const originalFetch = window.fetch;
  
  // Override di fetch per intercettare tutte le chiamate API
  window.fetch = async function(...args) {
    try {
      // Otteniamo la risposta
      const response = await originalFetch(...args);
      
      // Analizziamo solo le risposte alle chiamate Supabase
      const url = typeof args[0] === 'string' ? args[0] : '';
      const isSupabaseCall = url.includes(import.meta.env.VITE_SUPABASE_URL);
      
      if (isSupabaseCall && (response.status === 404 || response.status === 403)) {
        const clonedResponse = response.clone();
        try {
          // Cerca di analizzare il corpo della risposta come JSON
          const data = await clonedResponse.json();
          
          // Controlla specifici codici di errore che potrebbero indicare
          // che l'utente è stato eliminato
          if (data && data.error) {
            const errorMsg = typeof data.error === 'string' 
              ? data.error 
              : data.error.message || '';
            
            // Cerca messaggi specifici di errore che indicano che l'utente è stato eliminato
            // Utilizza condizioni più precise per evitare falsi positivi
            const isAuthError = (
              // Errori specifici JWT
              (errorMsg.includes('JWT') && (
                errorMsg.includes('invalid') || 
                errorMsg.includes('expired') || 
                errorMsg.includes('revoked')
              )) || 
              // Errori utente non trovato chiari
              (errorMsg.includes('user') && (
                errorMsg.includes('not found') || 
                errorMsg.includes('not exist') || 
                errorMsg.includes('deleted')
              )) ||
              // Errori di autorizzazione specifici
              (errorMsg.includes('permission denied') && errorMsg.includes('user'))
            );
            
            if (isAuthError) {
              deletionLogger.error('Rilevato problema di autenticazione specifico:', errorMsg);
              
              // Ignora errori su pagine pubbliche
              if (!window.location.pathname.includes('/login') && 
                  !window.location.pathname.includes('/auth')) {
                handlePossibleUserDeletion();
              }
            }
          }
        } catch (e) {
          // Se non riusciamo a leggere il JSON, controlliamo il testo
          // ma solo se non siamo in pagine pubbliche
          if (!window.location.pathname.includes('/login') && 
              !window.location.pathname.includes('/auth')) {
            const text = await response.clone().text();
            
            // Utilizziamo condizioni molto più restrittive per evitare falsi positivi
            const isAuthError = (
              (text.includes('JWT') && (text.includes('invalid') || text.includes('expired'))) ||
              (text.includes('user') && (text.includes('not found') || text.includes('deleted'))) ||
              (text.includes('auth') && text.includes('error'))
            );
            
            if (isAuthError) {
              deletionLogger.error('Rilevato problema di autenticazione dal testo:', text);
              handlePossibleUserDeletion();
            }
          }
        }
      }
      
      return response;
    } catch (error) {
      deletionLogger.error('Errore nella fetch intercettata:', error);
      return originalFetch(...args);
    }
  };
  
  // Implementa anche un watcher per i console.error nella pagina
  // ma usa condizioni molto più precise
  const originalConsoleError = console.error;
  console.error = function(...args) {
    // Chiamata originale
    originalConsoleError.apply(console, args);
    
    // Ignora gli errori sulle pagine pubbliche
    if (window.location.pathname.includes('/login') || 
        window.location.pathname.includes('/auth')) {
      return;
    }
    
    // Controlla se il messaggio di errore contiene indicazioni di problemi di autenticazione
    const errorString = args.map(arg => String(arg)).join(' ');
    
    // Utilizza condizioni più precise per evitare falsi positivi
    const isAuthError = (
      // Errori specifici JWT con contesto
      (errorString.includes('JWT') && (
        errorString.includes('invalid') || 
        errorString.includes('expired')
      )) || 
      // Errori utente non trovato chiari
      (errorString.includes('user') && (
        errorString.includes('not found') || 
        errorString.includes('deleted')
      )) ||
      // Errori specifici di autenticazione
      (errorString.includes('auth') && (
        errorString.includes('error') ||
        errorString.includes('unauthorized') ||
        errorString.includes('not authenticated')
      )) ||
      // Errori di autorizzazione specifici
      (errorString.includes('permission denied') && errorString.includes('user'))
    );
    
    if (isAuthError) {
      handlePossibleUserDeletion();
    }
  };
  
  // Implementa anche un listener per gli errori non catturati
  // ma con condizioni molto più restrittive
  window.addEventListener('unhandledrejection', function(event) {
    // Ignora gli errori sulle pagine pubbliche
    if (window.location.pathname.includes('/login') || 
        window.location.pathname.includes('/auth')) {
      return;
    }
    
    const errorString = String(event.reason);
    
    // Utilizza condizioni molto più precise per evitare falsi positivi
    const isAuthError = (
      // Errori specifici JWT con contesto
      (errorString.includes('JWT') && (
        errorString.includes('invalid') || 
        errorString.includes('expired')
      )) || 
      // Errori utente non trovato chiari
      (errorString.includes('user') && (
        errorString.includes('not found') || 
        errorString.includes('deleted')
      )) ||
      // Errori specifici di autenticazione
      (errorString.includes('auth') && (
        errorString.includes('invalid') ||
        errorString.includes('unauthorized') ||
        errorString.includes('not authenticated')
      )) ||
      // Errori di sessione
      (errorString.includes('session') && errorString.includes('invalid'))
    );
    
    if (isAuthError) {
      handlePossibleUserDeletion();
    }
  });
  
  // Configura un ping periodico per verificare l'esistenza dell'utente
  setupUserExistenceCheck();
}

/**
 * Verifica periodica dell'esistenza dell'utente
 */
function setupUserExistenceCheck() {
  // Crea una funzione per verificare l'esistenza dell'utente
  const checkUserExists = async () => {
    try {
      // Ottenimento della sessione corrente
      const { data: { session } } = await supabase.auth.getSession();
      
      // Se non c'è una sessione, non fare nulla
      if (!session) return;
      
      // Ottieni i parametri della sessione corrente
      const { user } = session;
      
      // Non utilizziamo più la chiamata RPC che causa errori 404
      // Verifichiamo direttamente la validità della sessione
      const { data: userResponse, error: userError } = await supabase.auth.getUser();
      
      // Se c'è un errore di autenticazione, potrebbe indicare che l'utente non esiste più
      if (userError) {
        // Verifica se l'errore è di tipo autenticazione
        if (userError.status === 401 || 
            userError.message?.toLowerCase().includes('unauthorized') ||
            userError.message?.toLowerCase().includes('jwt')) {
          handlePossibleUserDeletion();
          return;
        }
      }
      
      // Verifica alternativa accedendo a una tabella protetta da RLS
      // ma solo se siamo in una pagina che richiede autenticazione (non in pagine pubbliche come login)
      if (!window.location.pathname.includes('/login') && 
          !window.location.pathname.includes('/auth')) {
        
        const { error: tableError } = await supabase.from('ordini').select('id').limit(1);
        
        if (tableError) {
          deletionLogger.error('Errore nell\'accesso alla tabella protetta:', tableError);
          
          // Controlla specificamente se l'errore è di autorizzazione
          // e siamo sicuri che sia un errore di permesso negato (non generico)
          if ((tableError.code === 'PGRST301' || tableError.code === '42501') && 
              tableError.message?.toLowerCase().includes('permission denied')) {
            // Verifica ulteriormente che non siamo in una transizione di pagina
            if (document.readyState === 'complete') {
              handlePossibleUserDeletion();
            }
          }
        }
      }
    } catch (error) {
      deletionLogger.error('Errore durante il controllo dell\'esistenza dell\'utente:', error);
    }
  };
  
  // Variabile per tenere traccia dell'ultima esecuzione del controllo
  let lastCheckTime = 0;
  
  // Funzione wrapper che controlla se è il momento giusto per eseguire il controllo
  const conditionalCheck = () => {
    const now = Date.now();
    
    // Evita controlli troppo frequenti (minimo 60 secondi tra i controlli)
    if (now - lastCheckTime < 60000) return;
    
    // Evita controlli durante le transizioni di pagina
    if (document.readyState !== 'complete') return;
    
    // Aggiorna il timestamp dell'ultimo controllo
    lastCheckTime = now;
    
    // Esegui il controllo
    checkUserExists();
  };
  
  // Esegui il controllo dopo che la pagina è completamente caricata
  if (document.readyState === 'complete') {
    conditionalCheck();
  } else {
    window.addEventListener('load', conditionalCheck);
  }
  
  // Imposta un controllo ogni 2 minuti (invece di 30 secondi)
  const intervalId = setInterval(conditionalCheck, 120000);
  
  // Pulizia quando la pagina viene chiusa
  window.addEventListener('beforeunload', () => {
    clearInterval(intervalId);
  });
}

/**
 * Gestisce il caso in cui l'utente potrebbe essere stato eliminato
 */
function handlePossibleUserDeletion() {
  // Evita di eseguire multiple volte
  if (forcedLogoutTriggered) return;
  
  // Imposta il flag per evitare chiamate multiple
  forcedLogoutTriggered = true;
  
  deletionLogger.warn('Rilevata possibile eliminazione dell\'account utente. Forzo il logout.');
  
  // Aggiungi un breve ritardo per evitare race conditions
  setTimeout(async () => {
    try {
      // Logout da Supabase
      await supabase.auth.signOut();
      
      // Salva un flag per mostrare un messaggio all'utente
      localStorage.setItem('account-deleted', 'true');
      
      // Reindirizza alla pagina di login
      window.location.href = '/login';
    } catch (error) {
      deletionLogger.error('Errore durante il logout forzato:', error);
      
      // In caso di errore, tenta comunque di reindirizzare
      window.location.href = '/login';
    }
  }, 500);
}