import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Products from "@/pages/Products";
import OrderForm from "@/pages/OrderForm";
import OrderHistory from "@/pages/OrderHistory";

import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import EmailVerified from "@/pages/EmailVerified";
import ChangeEmailConfirmed from "@/pages/ChangeEmailConfirmed";
import ImpostazioniUtente from "@/pages/ImpostazioniUtente";
import Navbar from "@/components/ui/navbar";
import { Session } from "@supabase/supabase-js";
import { OnboardingTour } from "@/components/onboarding-tour";
import { useDeletionDetector } from "./hooks/use-deletion-detector";

function Router() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Otteniamo l'attuale percorso per determinare se siamo in una pagina di autenticazione
  // IMPORTANTE: Tutti gli hook devono essere chiamati all'inizio della funzione
  const [location] = useLocation();
  
  // Attiva il detector di eliminazione account che monitora la console e le chiamate API
  // per rilevare se l'utente è stato eliminato da Supabase e forzare il logout
  useDeletionDetector();

  useEffect(() => {
    // Check if there's an active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      
      // Controlla se è il primo accesso dell'utente
      if (session) {
        const hasSeenTour = localStorage.getItem('ordini-app-tour-completed');
        const isFirstLogin = localStorage.getItem('ordini-app-first-login');
        
        // Se non ha mai visto il tour e non abbiamo già segnato che è un primo login
        if (!hasSeenTour && !isFirstLogin) {
          // Segna che è un primo login (per evitare di riavviare il tour ogni volta)
          localStorage.setItem('ordini-app-first-login', 'true');
          // Imposta il flag per avviare il tour
          localStorage.setItem('ordini-app-avvia-tour', 'true');
        }
      }
      
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      
      // Se l'evento è SIGNED_IN e l'utente è appena registrato
      if (event === 'SIGNED_IN') {
        const hasSeenTour = localStorage.getItem('ordini-app-tour-completed');
        if (!hasSeenTour) {
          localStorage.setItem('ordini-app-avvia-tour', 'true');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-primary text-xl font-semibold">Caricamento...</div>
      </div>
    );
  }
  
  // Definiamo quali percorsi sono relativi all'autenticazione e non dovrebbero mostrare la navbar
  const isAuthPage = 
    location.startsWith('/auth/') || 
    location === '/login'||
    location === '/auth-preview';
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {session && !isAuthPage && <Navbar />}
      {session && !isAuthPage && <OnboardingTour />}
      <main className="flex-grow flex flex-col">
        <Switch>
          <Route path="/" component={session ? Products : Login} />
          <Route path="/login" component={Login} />
          <Route path="/auth/callback" component={AuthCallback} />
          <Route path="/auth/reset-password" component={ResetPassword} />
          <Route path="/auth/email-verified" component={EmailVerified} />
          <Route path="/auth/change-email-confirmed" component={ChangeEmailConfirmed} />
          <Route path="/products">
            {session ? <Products /> : <Login />}
          </Route>
          <Route path="/order">
            {session ? <OrderForm /> : <Login />}
          </Route>
          <Route path="/history">
            {session ? <OrderHistory /> : <Login />}
          </Route>

          <Route path="/account/settings">
            {session ? <ImpostazioniUtente /> : <Login />}
          </Route>
        
          <Route component={NotFound} />
        </Switch>
      </main>
      <footer className="py-4 text-center text-sm text-slate-500 mt-auto hidden sm:block">
        <div className="container">
          © {new Date().getFullYear()} Ordini App - Tutti i diritti riservati
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
