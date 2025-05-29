import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { getErrorMessage, getEmailFromUrlOrUser, hasSupabaseError, maskEmail } from '@/lib/auth-helpers';
import { getAuthState, clearAuthState } from '@/lib/auth-state';

export default function ChangeEmailConfirmed() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    // Funzione per analizzare l'URL e impostare gli stati corretti
    const processPage = async () => {
      try {
        // Controlla prima lo stato globale
        const authState = getAuthState();
        
        if (authState && authState.type) {
          // Abbiamo uno stato memorizzato, usalo
          if (authState.type === 'success') {
            // Caso di successo
            if (authState.email) {
              setUser(maskEmail(authState.email));
              setSuccess(true);
            } else {
              setSuccess(true);
            }
          } else if (authState.type === 'error') {
            // Caso di errore
            setError(authState.message || 'Si è verificato un errore durante il cambio email.');
            setSuccess(false);
          }
          
          // Pulisci lo stato per evitare riutilizzi
          clearAuthState();
          setIsLoaded(true);
          return;
        }
        
        // LOGICA FALLBACK: Se non c'è stato globale, controlla l'URL
        
        // Dobbiamo determinare se questa è una pagina di errore o di successo
        let hasError = false;
        let errorMessage = null;
        
        // 1. Controlla se ci sono errori nell'URL
        const url = window.location.href;
        if (url.includes('error_code=access_denied') || url.includes('access_denied')) {
          // Caso speciale per error_code=access_denied perché è comune
          hasError = true;
          errorMessage = 'Accesso negato. Il link per il cambio email potrebbe essere scaduto o non valido.';
        } else if (hasSupabaseError()) {
          // Altri errori espliciti di Supabase nell'URL
          hasError = true;
          errorMessage = getErrorMessage();
        } else {
          // 2. Se non ci sono errori espliciti, prova a ottenere l'email
          const emailFromUrlOrUser = await getEmailFromUrlOrUser();
          
          if (emailFromUrlOrUser) {
            // Se abbiamo trovato l'email, mostra il messaggio di successo
            setUser(maskEmail(emailFromUrlOrUser));
            setSuccess(true);
          } else {
            // Se non abbiamo trovato l'email e non abbiamo errori, è un errore implicito
            hasError = true;
            errorMessage = 'Non è stato possibile completare il cambio email. Potrebbe essere necessario riprovare.';
          }
        }
        
        // Se abbiamo un errore, imposta lo stato di errore
        if (hasError) {
          setError(errorMessage || 'Si è verificato un errore durante il cambio email.');
          setSuccess(false);
        }
        
        // Marca la pagina come caricata
        setIsLoaded(true);
      } catch (err) {
        setError('Si è verificato un errore durante l\'elaborazione della richiesta.');
        setSuccess(false);
        setIsLoaded(true);
      }
    };
    
    // Esegui l'elaborazione della pagina solo una volta
    processPage();
  }, []);

  // Effect separato per gestire il logout e reindirizzamento dopo che gli stati sono stati impostati
  useEffect(() => {
    // Esegui solo quando la pagina è stata completamente caricata
    if (!isLoaded) return;
    
    const logoutAndRedirect = async () => {
      try {
        // Logout
        await supabase.auth.signOut();
      } catch (err) {
        // Gestisce silenziosamente gli errori di logout
      }
      
      // Tempo di attesa più lungo in caso di errore per permettere la lettura
      const redirectTimeout = !success ? 4000 : 2000;
      setTimeout(() => setLocation('/login'), redirectTimeout);
    };
    
    // Attendiamo un attimo prima di eseguire il logout
    const timer = setTimeout(logoutAndRedirect, 1000);
    return () => clearTimeout(timer);
  }, [isLoaded, success, error, setLocation]);

  return (
    <div className="container py-4 sm:py-6 md:py-8 min-h-screen flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="bg-white shadow-sm rounded-lg p-6 sm:p-8 text-center">
          {!isLoaded ? (
            // Stato di caricamento
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <svg className="animate-spin h-10 w-10 sm:h-12 sm:w-12 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-slate-800 mb-3">Verifica in corso...</h1>
              <p className="text-sm text-slate-600">Stiamo verificando il tuo cambio email...</p>
            </>
          ) : success ? (
            // Stato di successo
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-green-50 rounded-full flex items-center justify-center mb-6">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-10 w-10 sm:h-12 sm:w-12 text-green-500" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="text-xl sm:text-2xl font-semibold text-slate-800 mb-3">
                Cambio email completato
              </h1>

              <p className="mb-6 text-sm sm:text-base text-slate-600">
                {user
                  ? `Il tuo indirizzo email è stato aggiornato correttamente a ${user}.`
                  : 'Il tuo indirizzo email è stato aggiornato correttamente.'}
              </p>
            </>
          ) : (
            // Stato di errore
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-6">
                <svg 
                  className="h-10 w-10 sm:h-12 sm:w-12 text-red-500" 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h1 className="text-xl sm:text-2xl font-semibold text-red-600 mb-3">
                Cambio email non riuscito
              </h1>

              <div className="mb-6 text-sm sm:text-base text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
                {error || 'Si è verificato un errore durante il cambio email. Il link potrebbe essere scaduto o non valido.'}
              </div>
            </>
          )}

          {isLoaded && (
            <p className="text-sm text-slate-500">
              Verrai reindirizzato alla pagina di accesso...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}