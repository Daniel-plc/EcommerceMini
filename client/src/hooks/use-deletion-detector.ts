import { useEffect } from 'react';
import { useToast } from './use-toast';
import { setupDeletionDetector } from '../lib/auth-deletion-detector';

/**
 * Hook per rilevare l'eliminazione dell'account dell'utente
 * e mostrare notifiche appropriate
 */
export function useDeletionDetector() {
  const { toast } = useToast();
  
  useEffect(() => {
    // Controlla se c'è un flag di account eliminato
    const accountDeleted = localStorage.getItem('account-deleted');
    if (accountDeleted === 'true') {
      // Mostra una notifica
      toast({
        title: 'Account non disponibile',
        description: 'Il tuo account non esiste più o è stato disattivato. Contatta l\'amministratore per assistenza.',
        variant: 'destructive',
      });
      
      // Rimuovi il flag per evitare notifiche ripetute
      localStorage.removeItem('account-deleted');
    }
    
    // Configura il rilevatore di eliminazione
    setupDeletionDetector();
    
    // Non c'è bisogno di cleanup per il rilevatore
  }, [toast]);
}