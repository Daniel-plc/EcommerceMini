import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Funzione per controllare se siamo su mobile (larghezza < 768px)
    const checkIfMobile = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 768);
      }
    };

    // Controllo iniziale
    checkIfMobile();

    // Aggiungi listener per il resize
    window.addEventListener('resize', checkIfMobile);

    // Rimuovi listener quando il componente si smonta
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  return isMobile;
}