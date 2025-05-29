import { useLocation } from 'wouter';
import { useEffect } from 'react';

export default function EmailVerified() {
  const [, setLocation] = useLocation();

  // Reindirizza automaticamente alla pagina di login dopo 2 secondi
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLocation('/login');
    }, 2000);

    return () => clearTimeout(timeout);
  }, [setLocation]);

  return (
    <div className="container py-4 sm:py-6 md:py-8 min-h-screen flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="bg-white shadow-sm rounded-lg p-6 sm:p-8 text-center">
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
            Registrazione completata con successo
          </h1>

          <p className="mb-6 text-sm sm:text-base text-slate-600">
            La tua email è stata confermata correttamente. Ora puoi accedere.
          </p>

          <button
            onClick={() => setLocation('/login')}
            className="flex justify-center items-center w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
          >
            Vai alla pagina di accesso
          </button>
        </div>
      </div>
    </div>
  );
}

