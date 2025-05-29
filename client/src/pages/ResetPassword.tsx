import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import logger from '@/lib/logger';

// Logger specifico per la pagina ResetPassword
const resetLogger = logger.createLogger('ResetPassword');

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // 1) Imposta la sessione usando i token che arrivano nell'URL (hash o query)
  useEffect(() => {
    const completaSessione = async () => {
      try {
        // Metodo 1: Prova prima a recuperare i token dalla URL hash
        let access_token = null;
        let refresh_token = null;
        
        // Se l'URL contiene un hash, controlla lì prima
        if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          access_token = hashParams.get('access_token');
          refresh_token = hashParams.get('refresh_token');
        }
        
        // Se non ha trovato i token nell'hash, controlla nella query string
        if (!access_token || !refresh_token) {
          const queryParams = new URLSearchParams(window.location.search);
          access_token = queryParams.get('access_token');
          refresh_token = queryParams.get('refresh_token');
        }
        
        // Se ancora non trovati, prova a recuperare dalla sessione corrente
        // Questo potrebbe funzionare se AuthCallback ha già impostato la sessione
        if (!access_token || !refresh_token) {
          resetLogger.info("Tentativo di recuperare la sessione esistente...");
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session) {
            resetLogger.info("Sessione esistente trovata");
            // Se c'è già una sessione valida, possiamo procedere senza errori
            return;
          }
        }

        // Se i token sono stati trovati, imposta la sessione
        if (access_token && refresh_token) {
          resetLogger.info("Token trovati, impostazione sessione...");
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) {
            resetLogger.error('Errore impostando la sessione:', sessionError.message);
            setError('Impossibile ripristinare la sessione. Riprova.');
          } else {
            resetLogger.info("Sessione impostata correttamente");
          }
        } else {
          // Metodo 2: Se non riesce a trovare i token, prova exchangeCodeForSession
          resetLogger.info("Tentativo di scambiare codice per sessione...");
          const { error: exchangeError } = await (supabase.auth as any).exchangeCodeForSession(window.location.href);
          
          if (exchangeError) {
            resetLogger.error('Errore durante lo scambio del codice:', exchangeError.message);
            setError('Link non valido o scaduto. Richiedi un nuovo link.');
          } else {
            resetLogger.info("Codice scambiato con successo");
          }
        }
      } catch (err: any) {
        resetLogger.error('Errore durante il recupero della sessione:', err.message);
        setError('Si è verificato un errore durante la verifica. Richiedi un nuovo link.');
      }
    };

    completaSessione();
  }, []);

  // 2) Validazione “live” della password
  const validatePassword = (pw: string): string[] => {
    const errs: string[] = [];
    if (pw.length < 6) errs.push('Almeno 6 caratteri');
    if (!/[A-Z]/.test(pw)) errs.push('Almeno una lettera maiuscola');
    if (!/[0-9]/.test(pw)) errs.push('Almeno un numero');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) errs.push('Almeno un carattere speciale');
    return errs;
  };
  useEffect(() => {
    setPasswordErrors(password ? validatePassword(password) : []);
  }, [password]);

  // 3) Invio della nuova password
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (passwordErrors.length > 0) {
      setError(passwordErrors[0]);
      return;
    }
    if (password !== confirmPassword) {
      setError('Le password non corrispondono');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess('Password reimpostata con successo!');
      toast({
        title: 'Password aggiornata',
        description: 'Ora puoi effettuare il login con la nuova password',
      });
      setTimeout(() => setLocation('/login'), 2000);
    } catch (err: any) {
      resetLogger.error("Errore durante la reimpostazione della password:", err);
      setError(
        err.message.includes('token')
          ? 'Il link è scaduto o non valido. Richiedi un nuovo link.'
          : 'Errore durante la reimpostazione. Riprova.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4 sm:py-6 md:py-8 min-h-screen flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-800">
            Reimposta password
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Crea una nuova password sicura per il tuo account
          </p>
        </div>

        <div className="bg-white shadow-sm rounded-lg p-6 sm:p-8">
          {error && (
            <div
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-5 flex items-start"
              role="alert"
            >
              <svg className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm mb-5 flex items-start"
              role="alert"
            >
              <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Nuova password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`block w-full px-3 py-2 border ${
                  passwordErrors.length > 0 ? 'border-red-300' : 'border-slate-300'
                } rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm`}
                placeholder="Inserisci la nuova password"
              />
            </div>

            <div className="text-xs text-red-600">
              {password && passwordErrors.length > 0 && passwordErrors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
              {password && passwordErrors.length === 0 && (
                <div className="text-green-600">La password soddisfa tutti i requisiti</div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Conferma password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="Ripeti la password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2 px-4 bg-primary text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Reimpostazione in corso...' : 'Reimposta Password'}
            </button>

            <div className="text-sm text-center pt-2">
              <button
                type="button"
                onClick={() => setLocation('/login')}
                className="text-primary hover:underline focus:outline-none font-medium"
              >
                Torna alla pagina di accesso
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}








