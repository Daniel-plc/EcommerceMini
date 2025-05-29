import { useState } from 'react';
import { useLocation } from 'wouter';
import { useSupabaseAuth } from '@/hooks/useSupabase';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const { signIn } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      await signIn(email, password);
      setLocation('/products');
    } catch (error: any) {
      // Traduciamo i messaggi di errore comuni da inglese a italiano
      let errorMessage = '';
      if (error.message === 'Invalid login credentials') {
        errorMessage = 'Email o password non corretti';
      } else if (error.message.includes('email already in use')) {
        errorMessage = 'Email già in uso, contatta l\'amministratore';
      } else if (error.message.includes('For security purposes')) {
        errorMessage = 'Per motivi di sicurezza, puoi effettuare questa richiesta solo dopo alcuni secondi';
      } else if (error.message.includes('Email rate limit exceeded')) {
        errorMessage = 'Hai superato il limite di richieste email. Riprova più tardi';
      } else {
        errorMessage = error.message || 'Si è verificato un errore durante l\'operazione';
      }
      
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Funzione per reset password
  const handleResetPassword = async () => {
    if (!email) {
      toast({
        title: "Errore",
        description: "Inserisci la tua email per reimpostare la password",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/reset-password',
      });
      
      if (error) throw error;
      
      setResetRequested(true);
      toast({
        title: "Email inviata",
        description: "Se l'email è corretta, riceverai un link per reimpostare la password",
        variant: "default"
      });
    } catch (error: any) {
      // Traduciamo i messaggi di errore comuni da inglese a italiano
      let errorMessage = '';
      if (error.message.includes('rate limit')) {
        errorMessage = 'Troppe richieste, riprova tra qualche minuto';
      } else if (error.message.includes('User not found')) {
        errorMessage = 'Utente non trovato con questa email';
      } else if (error.message.includes('For security purposes')) {
        errorMessage = 'Per motivi di sicurezza, puoi effettuare questa richiesta solo dopo alcuni secondi';
      } else {
        errorMessage = error.message || 'Errore durante la richiesta di reset password';
      }
      
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container py-4 sm:py-6 md:py-8 min-h-screen flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-800">
            Accedi
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Accedi al tuo account per iniziare a utilizzare l'applicazione
          </p>
        </div>

        <div className="bg-white shadow-sm rounded-lg p-6 sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="Inserisci la tua email"
              />
            </div>

            <div>
              <div className="flex justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
            
            {/* Checkbox "Ricordami" rimosso, usiamo sempre sessioni temporanee */}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Accesso in corso...
                  </span>
                ) : (
                  <span>Accedi</span>
                )}
              </button>
            </div>
            
            <div className="text-xs text-center">
              <button 
                type="button" 
                onClick={handleResetPassword}
                className="text-primary hover:text-primary/80 hover:underline transition-colors font-medium"
                disabled={loading || resetRequested}
              >
                {resetRequested ? (
                  <span className="flex items-center justify-center">
                    <svg className="h-3.5 w-3.5 mr-1 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Email di reset inviata
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <svg className="h-3.5 w-3.5 mr-1 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Hai dimenticato la password?
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            Non hai un account? Contatta l'amministratore per ricevere un invito.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;