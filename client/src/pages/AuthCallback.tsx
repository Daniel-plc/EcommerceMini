import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { getErrorMessage, hasSupabaseError } from '@/lib/auth-helpers';
import { setAuthState } from '@/lib/auth-state';
import logger from '@/lib/logger';

// Logger specifico per la pagina AuthCallback
const authCallbackLogger = logger.createLogger('AuthCallback');

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get('type');

        // Caso: conferma cambio email
        if (type === 'email_change') {
          try {
            // Controllo immediato per errori nell'URL
            // In particolare per il caso "access_denied" che è quello più comune
            const url = window.location.href;
            if (url.includes('error_code=access_denied') || url.includes('access_denied') || hasSupabaseError()) {
              // Usa un messaggio specifico per access_denied perché è un caso comune
              let errorMsg = 'Si è verificato un errore durante il cambio email';
              
              if (url.includes('error_code=access_denied') || url.includes('access_denied')) {
                errorMsg = 'Accesso negato. Il link per il cambio email potrebbe essere scaduto o non valido.';
                authCallbackLogger.info('Rilevato errore di accesso negato nella URL');
              } else {
                errorMsg = getErrorMessage() || errorMsg;
                authCallbackLogger.info('Errore nel cambio email rilevato nella URL:', errorMsg);
              }
              
              // NUOVA STRATEGIA: Memorizza lo stato di errore globalmente
              authCallbackLogger.info('Impostazione stato di errore globale con messaggio:', errorMsg);
              setAuthState('error', errorMsg);
              
              // Usa sempre un ritardo consistente prima del redirect
              await new Promise(resolve => setTimeout(resolve, 500));
              setIsProcessing(false);
              
              // Redirect diretto senza parametri URL, lo stato è memorizzato globalmente
              authCallbackLogger.info('Reindirizzamento a pagina di conferma (errore memorizzato globalmente)');
              setLocation('/auth/change-email-confirmed');
              return;
            }
            
            authCallbackLogger.info('Tentativo di scambio codice per sessione nel cambio email...');
            let email = null;
            
            try {
              // Tenta lo scambio del codice per ottenere una sessione
              const { data, error: sessionError } = await (supabase.auth as any).exchangeCodeForSession();
              
              if (sessionError) {
                authCallbackLogger.error('Errore durante lo scambio codice:', sessionError);
                throw sessionError;
              }
              
              authCallbackLogger.info('Sessione ottenuta:', data);
              // Se l'utente è presente nei dati della sessione, usa la sua email
              if (data?.user?.email) {
                email = data.user.email;
                authCallbackLogger.info('Email trovata nella sessione:', email);
              }
            } catch (sessionErr: any) {
              authCallbackLogger.error('Errore nel processo di scambio del codice:', sessionErr);
              
              // Prova a ottenere l'utente corrente anche se c'è stato un errore
              try {
                const { data: userData } = await supabase.auth.getUser();
                if (userData?.user?.email) {
                  email = userData.user.email;
                  authCallbackLogger.info('Email recuperata dall\'utente corrente dopo errore:', email);
                }
              } catch (userErr) {
                authCallbackLogger.error('Errore nel recupero dell\'utente:', userErr);
                throw sessionErr; // Rilancia l'errore originale
              }
            }
            
            // Se abbiamo trovato l'email, memorizza lo stato di successo globalmente
            if (email) {
              authCallbackLogger.info('Impostazione stato di successo globale con email:', email);
              setAuthState('success', undefined, email);
              
              await new Promise(resolve => setTimeout(resolve, 500));
              setIsProcessing(false);
              authCallbackLogger.info('Reindirizzamento a pagina di conferma (successo memorizzato globalmente)');
              setLocation('/auth/change-email-confirmed');
              return;
            }
            
            // Se non siamo riusciti a trovare l'email, imposta uno stato di errore
            authCallbackLogger.info('Nessuna email trovata, impostazione stato di errore generico');
            setAuthState('error', 'Non è stato possibile completare il cambio email. L\'email non è stata trovata.');
            
            await new Promise(resolve => setTimeout(resolve, 500));
            setIsProcessing(false);
            setLocation('/auth/change-email-confirmed');
          } catch (err: any) {
            authCallbackLogger.error('Errore durante il cambio email:', err.message);
            
            // Memorizza l'errore nello stato globale
            setAuthState('error', err.message);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            setIsProcessing(false);
            authCallbackLogger.info('Reindirizzamento a pagina di conferma (errore memorizzato globalmente)');
            setLocation('/auth/change-email-confirmed');
          }
          return;
        }

        // tutti gli altri flussi: signup, magic link, recovery
        const { data, error: sessionError } = await (supabase.auth as any).exchangeCodeForSession();
        if (sessionError) throw sessionError;

        if (type === 'signup' || type === 'email_confirm') {
          // Recupera email dell'utente per il mascheramento
          const userEmail = data?.user?.email;
          setLocation(userEmail 
            ? `/auth/email-verified?email=${encodeURIComponent(userEmail)}` 
            : '/auth/email-verified');
        } else if (type === 'recovery') {
          // Per i flussi di recovery, controlla se ci sono token nel hash da passare
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');
          
          // Se ci sono token, aggiungi alla URL di reset password
          if (access_token && refresh_token) {
            setLocation(`/auth/reset-password#access_token=${access_token}&refresh_token=${refresh_token}`);
          } else {
            // Altrimenti reindirizza senza parametri (gestirà l'errore la pagina di reset)
            setLocation('/auth/reset-password');
          }
        } else {
          setLocation('/products');
        }

      } catch (err: any) {
        authCallbackLogger.error('Errore durante il callback:', err.message);
        setError(err.message);
        setTimeout(() => setLocation('/login'), 3000);
      }
    };

    handleAuthCallback();
  }, [setLocation]);

  return (
    <div className="container py-4 sm:py-6 md:py-8 min-h-screen flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="bg-white shadow-sm rounded-lg p-6 sm:p-8 text-center">
          {!error ? (
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <svg className="animate-spin h-10 w-10 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-slate-800 mb-3">Autenticazione in corso...</h1>
              <p className="text-sm text-slate-600">Stai per essere reindirizzato...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-6">
                <svg className="h-10 w-10 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-red-600 mb-3">Si è verificato un errore</h1>
              <p className="text-sm text-slate-700 mb-4 bg-slate-50 p-3 rounded border border-slate-200">{error}</p>
              <p className="text-sm text-slate-600">Verrai riportato al login a breve...</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}




































