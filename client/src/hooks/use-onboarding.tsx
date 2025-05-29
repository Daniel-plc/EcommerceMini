import { useState, useEffect } from 'react';

type OnboardingState = {
  isEnabled: boolean;
  completed: boolean;
  step: number;
};

const initialState: OnboardingState = {
  isEnabled: false,
  completed: false,
  step: 0,
};

// Chiave per il localStorage
const ONBOARDING_KEY = 'ordini-app-onboarding';

export function useOnboarding(): {
  isEnabled: boolean;
  completed: boolean;
  step: number;
  startTour: () => void;
  stopTour: () => void;
  completeTour: () => void;
  resetTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
} {
  // Recupera lo stato dal localStorage o usa quello iniziale
  const [state, setState] = useState<OnboardingState>(() => {
    if (typeof window === 'undefined') return initialState;
    
    const saved = localStorage.getItem(ONBOARDING_KEY);
    if (!saved) return initialState;
    
    try {
      return JSON.parse(saved);
    } catch (e) {
      return initialState;
    }
  });

  // Aggiorna il localStorage quando lo stato cambia
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Salva lo stato completo
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
      
      // Salva anche flag separati per controlli rapidi
      if (state.completed) {
        localStorage.setItem('ordini-app-tour-completed', 'true');
      } else {
        localStorage.removeItem('ordini-app-tour-completed');
      }
      
      if (state.isEnabled) {
        localStorage.setItem('ordini-app-tour-active', 'true');
      } else {
        localStorage.removeItem('ordini-app-tour-active');
      }
    }
  }, [state]);

  // Controlla se è la prima visita dell'utente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Utilizziamo un altro flag nel localStorage per determinare il primo accesso
      // questo evita conflitti con l'oggetto di stato del tour
      const hasVisitedBefore = localStorage.getItem('ordini-app-has-visited');
      
      if (!hasVisitedBefore) {
        // Impostiamo il flag di visita
        localStorage.setItem('ordini-app-has-visited', 'true');
        // Forziamo isEnabled a true per il primo accesso
        setState(prev => ({ ...prev, isEnabled: true }));
      }
    }
  }, []);

  // Funzioni per controllare il tour
  const startTour = () => setState(prev => ({ ...prev, isEnabled: true, step: 0 }));
  const stopTour = () => setState(prev => ({ ...prev, isEnabled: false }));
  const completeTour = () => setState(prev => ({ ...prev, isEnabled: false, completed: true }));
  const resetTour = () => {
    // Rimuove tutti i dati del tour dal localStorage
    if (typeof window !== 'undefined') {
      // Rimuovi lo stato principale
      localStorage.removeItem(ONBOARDING_KEY);
      
      // Rimuovi tutti i flag correlati al tour
      localStorage.removeItem('ordini-app-has-visited');
      localStorage.removeItem('ordini-app-tour-completed');
      localStorage.removeItem('ordini-app-tour-active');
      localStorage.removeItem('ordini-app-first-login');
      localStorage.removeItem('ordini-app-avvia-tour');
      localStorage.removeItem('ordini-app-restart-tour');
      localStorage.removeItem('ordini-app-restart-step');
      localStorage.removeItem('ordini-app-current-step');
      localStorage.removeItem('ordini-app-last-page');
    }
    setState(initialState);
  };
  const nextStep = () => setState(prev => ({ ...prev, step: prev.step + 1 }));
  const prevStep = () => setState(prev => ({ ...prev, step: Math.max(0, prev.step - 1) }));
  const goToStep = (step: number) => setState(prev => ({ ...prev, step }));

  return {
    ...state,
    startTour,
    stopTour,
    completeTour,
    resetTour,
    nextStep,
    prevStep,
    goToStep,
  };
}