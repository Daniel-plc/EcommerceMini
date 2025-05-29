// Memorizza lo stato dell'autenticazione tra le pagine
// Questo permette di evitare flickering tra stati durante i reindirizzamenti
import logger from './logger';

// Logger specifico per il modulo di autenticazione
const authLogger = logger.createLogger('AuthState');

// Tipi di stato disponibili
export type AuthStateType = 'success' | 'error' | null;

// Interfaccia per lo stato di autenticazione
interface AuthState {
  type: AuthStateType;
  message?: string;
  email?: string;
  timestamp: number;
}

// Stato globale (durata della sessione browser)
let globalAuthState: AuthState = {
  type: null,
  timestamp: 0
};

// Tempo di scadenza dello stato in millisecondi (30 secondi)
const STATE_EXPIRY = 30 * 1000;

/**
 * Imposta lo stato di autenticazione
 */
export function setAuthState(state: AuthStateType, message?: string, email?: string): void {
  globalAuthState = {
    type: state,
    message,
    email,
    timestamp: Date.now()
  };
  
  authLogger.debug('Stato di autenticazione impostato:', globalAuthState);
}

/**
 * Ottiene lo stato di autenticazione corrente se è valido
 * (non scaduto)
 */
export function getAuthState(): AuthState | null {
  // Se lo stato è nullo o è scaduto, restituisci null
  if (!globalAuthState.type || Date.now() - globalAuthState.timestamp > STATE_EXPIRY) {
    return null;
  }
  
  return globalAuthState;
}

/**
 * Cancella lo stato di autenticazione
 */
export function clearAuthState(): void {
  globalAuthState = {
    type: null,
    timestamp: 0
  };
}