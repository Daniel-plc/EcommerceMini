import React, { useEffect, useState } from 'react';
import Joyride, { CallBackProps, Step } from 'react-joyride';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

// Stile di base per i tooltip
const defaultOptions = {
  arrowColor: '#fff',
  backgroundColor: '#fff',
  beaconSize: 36,
  overlayColor: 'rgba(0, 0, 0, 0.5)',
  primaryColor: '#4f46e5',
  spotlightShadow: '0 0 15px rgba(0, 0, 0, 0.5)',
  textColor: '#333',
  width: undefined,
  zIndex: 1000,
};

// Proprietà comuni a tutti gli step per evitare problemi di scroll
const commonStepProps = {
  disableScrolling: true,         // Disabilita lo scrolling automatico per tutti gli step
  disableScrollParentFix: true,   // Evita che Joyride faccia aggiustamenti allo scrolling
  disableBeacon: true,            // Disattiva i beacon per evitare problemi di posizionamento
};

// Definizione dei passi del tour (versione desktop)
const desktopSteps: Step[] = [
  {
    target: '.navbar',
    title: 'Navigazione',
    content: 'Da qui puoi navigare tra le diverse sezioni dell\'applicazione: Prodotti, Ordini, Storico e Impostazioni.',
    placement: 'bottom',
    ...commonStepProps,
  },
  {
    target: '.search-box',
    title: 'Ricerca Prodotti',
    content: 'Cerca rapidamente i prodotti inserendo il codice o parole chiave.',
    placement: 'auto',
    isFixed: true,
    ...commonStepProps,
  },
  {
    target: '.product-card',
    title: 'Scheda Prodotto',
    content: 'Qui trovi le informazioni sul prodotto. Puoi configurare le opzioni e aggiungere al carrello.',
    placement: 'left',
    ...commonStepProps,
  },
  {
    target: '.navbar', 
    title: 'Pagina Ordini',
    content: 'Qui vedrai il riepilogo del tuo ordine. Per ora la pagina è vuota perché non hai ancora aggiunto prodotti.',
    placement: 'bottom',
    ...commonStepProps,
  },
  {
    target: '.navbar',
    title: 'Storico Ordini',
    content: 'Qui potrai visualizzare lo storico dei tuoi ordini completati. Per ora non ci sono ordini perché non ne hai ancora effettuati.',
    placement: 'bottom',
    ...commonStepProps,
  },
  {
    target: '.navbar',
    title: 'Impostazioni Utente',
    content: 'Da qui puoi gestire le impostazioni del tuo account, modificare email e password, e personalizzare l\'esperienza d\'uso dell\'applicazione.',
    placement: 'bottom',
    ...commonStepProps,
  }
];

// Versione mobile dei passi del tour (con placement adattato)
const mobileSteps: Step[] = desktopSteps.map(step => ({
  ...step,
  placement: 'auto' as const,
  styles: {
    options: {
      ...defaultOptions,
      width: 290,
    }
  }
}));

// Mappatura degli step alle pagine
const stepToPageMap: Record<number, string> = {
  0: 'products',        // Navbar (in pagina prodotti)
  1: 'products',        // Ricerca (in pagina prodotti)
  2: 'products',        // Scheda prodotto
  3: 'order',           // Pagina ordini
  4: 'history',         // Pagina storico
  5: 'account/settings' // Pagina impostazioni (percorso completo)
};

// Componente per il tour di onboarding
export function OnboardingTour() {
  const isMobile = useIsMobile();
  const { isEnabled, step, startTour, stopTour, completeTour, nextStep, prevStep, goToStep } = useOnboarding();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  // Imposta i passi corretti in base al dispositivo
  useEffect(() => {
    setSteps(isMobile ? mobileSteps : desktopSteps);
  }, [isMobile]);

  // Controllo l'avvio del tour dalle impostazioni o il riavvio dopo il ritorno
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const shouldStartTour = localStorage.getItem('ordini-app-avvia-tour') === 'true';
    const shouldRestartTour = localStorage.getItem('ordini-app-restart-tour') === 'true';
    
    // Puliamo subito entrambi i flag
    localStorage.removeItem('ordini-app-avvia-tour');
    localStorage.removeItem('ordini-app-restart-tour');
    
    if (shouldStartTour) {
      // Avvia il tour normalmente
      startTour();
    } 
    else if (shouldRestartTour && isEnabled) {
      // Ottieni lo step da ripristinare
      const restartStep = localStorage.getItem('ordini-app-restart-step');
      localStorage.removeItem('ordini-app-restart-step');
      
      // Se abbiamo un valore step, lo impostiamo
      if (restartStep) {
        const stepNumber = parseInt(restartStep, 10);
        
        // Aggiorna lo step e forza il riavvio del tour
        goToStep(stepNumber);
        
        // Forza la visualizzazione
        setRun(true);
      }
    }
  }, [startTour, isEnabled, goToStep]);

  // Mantiene traccia della pagina precedente del tour
  useEffect(() => {
    if (isEnabled) {
      // Salva lo step corrente quando cambia
      localStorage.setItem('ordini-app-current-step', step.toString());
    }
  }, [isEnabled, step]);
  
  // Gestione dell'avvio del tour e della navigazione tra pagine
  useEffect(() => {
    if (!isEnabled) {
      setRun(false);
      return;
    }

    // Calcola la pagina corrente (gestisce anche percorsi più complessi)
    let currentPage = '';
    if (location === '/') {
      currentPage = 'products';
    } else if (location.startsWith('/account/')) {
      currentPage = 'account/settings';
    } else {
      currentPage = location.replace('/', '');
    }
    
    // Memorizza l'ultima pagina visitata
    const lastPage = localStorage.getItem('ordini-app-last-page');
    
    // Determina la pagina in cui dovremmo essere per questo step
    const expectedPage = stepToPageMap[step];
    
    // Se veniamo da una pagina diversa e stiamo tornando a prodotti, forza un reset
    if (lastPage && 
        lastPage !== currentPage && 
        currentPage === 'products' && 
        (step === 0 || step === 1 || step === 2)) {
      // Forza il reset dell'UI
      setRun(false);
      setTimeout(() => {
        // E poi riattiva
        setRun(true);
      }, 200);
    }
    
    // Aggiorna l'ultima pagina visitata
    if (currentPage) {
      localStorage.setItem('ordini-app-last-page', currentPage);
    }
    
    // Se non siamo nella pagina giusta, reindirizza
    if (expectedPage && currentPage !== expectedPage) {
      setLocation(`/${expectedPage}`);
      return; // L'effetto verrà ricaricato dopo il cambio pagina
    }

    // Verifica che gli elementi necessari siano disponibili nella pagina
    const checkElements = () => {
      // Cerca la navbar (dovrebbe essere presente in tutte le pagine)
      let navbarEl = document.querySelector('.navbar');
      
      // Se non troviamo una navbar con la classe specifica, proviamo con altri selettori
      if (!navbarEl) {
        navbarEl = document.querySelector('nav') || 
                  document.querySelector('header nav') ||
                  document.querySelector('header');
        
        // Se abbiamo trovato la navbar con un altro selettore, aggiungiamo la classe
        if (navbarEl && !navbarEl.classList.contains('navbar')) {
          navbarEl.classList.add('navbar');
        }
      }
      
      const hasNavbar = !!navbarEl;
      
      // Per i prodotti, verifica anche la presenza di card dei prodotti
      let hasRequiredElements = hasNavbar;
      
      if (currentPage === 'products' && step < 3) {
        const hasProductCard = !!document.querySelector('.product-card');
        hasRequiredElements = hasNavbar && hasProductCard;
      }
      
      if (hasRequiredElements) {
        setRun(true);
      } else {
        setTimeout(checkElements, 500);
      }
    };
    
    // Inizia il controllo dopo un breve ritardo
    const timer = setTimeout(checkElements, 300);
    
    return () => clearTimeout(timer);
  }, [isEnabled, location, step, setLocation]);

  // Gestisce i callback del tour
  const handleJoyrideCallback = (data: CallBackProps) => {
    const { action, index, status, type } = data;
    
    // Tour completato o saltato
    if (status === 'finished' || status === 'skipped') {
      setRun(false);
      completeTour();
      
      toast({
        title: 'Tour completato!',
        description: 'Puoi riavviarlo in qualsiasi momento dalle impostazioni.',
        duration: 5000,
      });
    } 
    // Gestione click su "Avanti" o "Indietro"
    else if (type === 'step:after') {
      if (action === 'prev') {
        // Quando si va indietro, forza il reset dell'interfaccia se necessario
        
        // Se stiamo tornando alla pagina prodotti (da step 3, 4 o 5 a qualsiasi step 0-2)
        // Per esempio, step 4 (history) → step 3 (order) → step 2 (products)
        if (step === 3 || step === 4 || step === 5) {
          // Prepariamo info per gestire il ritorno a prodotti in due passaggi
          const nextStep = step - 1; // nuovo step
          
          // Se il prossimo step sarà nella pagina prodotti, abbiamo bisogno di gestione speciale
          const returnToProducts = nextStep <= 2;
          
          // Aggiorna lo step (prima di tutto)
          prevStep();
          
          if (returnToProducts) {
            // Memorizziamo che dobbiamo riavviare il tour dopo cambio pagina
            localStorage.setItem('ordini-app-restart-tour', 'true');
            localStorage.setItem('ordini-app-restart-step', String(nextStep));
            
            // Disattiva il tour temporaneamente
            setRun(false);
            
            // In un timeout (per dare tempo alla navigazione)
            setTimeout(() => {
              // Riavvia il tour
              goToStep(nextStep);
              setRun(true);
            }, 300);
          }
        } else {
          // Normalmente, solo cambia step
          prevStep();
        }
      } else {
        // Nessun problema con il pulsante avanti
        nextStep();
      }
    } 
    // All'inizio di ogni step
    else if (type === 'step:before') {
      goToStep(index);
    } 
    // Gestione errori (non interrompe il tour)
    else if (status === 'error') {
      // Prova a ripristinare il tour in caso di errore
      setRun(false);
      setTimeout(() => setRun(true), 300);
    } 
    // Gestione della chiusura manuale
    else if (type === 'tour:end') {
      setRun(false);
      completeTour();
      
      toast({
        title: 'Tour interrotto',
        description: 'Puoi riavviarlo in qualsiasi momento dalle impostazioni.',
        duration: 5000,
      });
    }
  };

  // Se la pagina non è pronta o il tour non è in esecuzione, non mostrare nulla
  if (typeof document === 'undefined' || !run) return null;

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      run={run}
      scrollToFirstStep={false}         // Disabilita lo scrolling automatico per first step
      showProgress
      showSkipButton
      disableCloseOnEsc
      disableOverlayClose
      disableScrolling={true}           // Disabilita lo scrolling per tutti gli step
      hideBackButton={false}
      spotlightClicks
      steps={steps}
      stepIndex={step}
      styles={{
        options: defaultOptions,
        buttonBack: {
          marginRight: 10,
        },
        buttonSkip: {
          color: '#666',
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#4f46e5',
        },
        spotlight: {
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }
      }}
      locale={{
        back: 'Indietro',
        close: 'Chiudi',
        last: 'Fine',
        next: 'Avanti',
        skip: 'Salta tour'
      }}
    />
  );
}