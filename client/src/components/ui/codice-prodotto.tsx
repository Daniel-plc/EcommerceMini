import { useEffect, useState, memo, useMemo } from "react";
import { getCodiceProdotto, precaricaCodiciProdotto } from "@/lib/supabase";
import { Badge } from "./badge";
import logger from "@/lib/logger";

// Disabilitiamo i log non necessari per migliorare le prestazioni
const codiceLogger = logger.createLogger('CodiceProdotto');

/**
 * Props per il componente CodiceProdotto
 */
interface CodiceProdottoProps {
  prodottoId: number;
  configurazione: Record<string, string>;
  className?: string;
  prefisso?: string;
  visualizzaSempre?: boolean;
  noPrefix?: boolean;
  priority?: boolean; // Nuovo flag per indicare priorità di caricamento
}

// Cache locale per codici recentemente caricati durante la sessione
// Questo riduce ulteriormente le richieste e migliora la reattività
const localSessionCache: Record<string, string | null> = {};

/**
 * Implementazione base (non memorizzata) del componente CodiceProdotto
 * Ottimizzata per prestazioni con caricamento differito e priorità
 */
const CodiceProdottoBase = ({
  prodottoId,
  configurazione,
  className = "",
  prefisso = "Cod.",
  visualizzaSempre = false,
  noPrefix = false,
  priority = false
}: CodiceProdottoProps) => {
  const [codice, setCodice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memorizza la configurazione per evitare serializzazioni ripetute
  const configKey = useMemo(() => {
    return `${prodottoId}:${JSON.stringify(configurazione)}`;
  }, [prodottoId, configurazione]);

  useEffect(() => {
    let isMounted = true;
    
    // Verifica se il codice è nella cache locale della sessione
    if (localSessionCache[configKey] !== undefined) {
      setCodice(localSessionCache[configKey]);
      setLoading(false);
      return;
    }

    const fetchCodice = async () => {
      try {
        // Verifica immediata per evitare richieste mentre il componente viene smontato
        if (!isMounted) return;
        
        const codiceProdotto = await getCodiceProdotto(prodottoId, configurazione);
        
        // Memorizza in cache locale
        localSessionCache[configKey] = codiceProdotto;
        
        // Aggiorna lo stato solo se il componente è ancora montato
        if (isMounted) {
          setCodice(codiceProdotto);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Errore nel recupero del codice prodotto"));
          setLoading(false);
        }
      }
    };

    // Utilizziamo un timeout basato sulla priorità per evitare blocchi dell'interfaccia
    // Prodotti prioritari vengono caricati subito, gli altri con un ritardo minimo
    const timeoutId = setTimeout(
      fetchCodice, 
      priority ? 0 : 10 // Ritardo ridotto per migliorare la reattività nella pagina ordini
    );

    // Pulizia al dismount del componente
    return () => {
      clearTimeout(timeoutId);
      isMounted = false;
    };
  }, [prodottoId, configKey, priority]);

  // Nasconde il componente se non c'è codice e visualizzaSempre è falso
  if (!visualizzaSempre && !codice && !loading) {
    return null;
  }

  return (
    <Badge 
      variant="outline" 
      className={`text-[10px] font-medium ${loading ? 'bg-slate-100 text-slate-400' : 'bg-primary/10 text-primary'} px-1.5 py-0.5 whitespace-nowrap ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-1">
          <svg className="animate-spin h-2.5 w-2.5 text-slate-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Caricamento...</span>
        </span>
      ) : error ? (
        noPrefix ? "N/D" : `${prefisso} N/D` 
      ) : (
        noPrefix ? codice : `${prefisso} ${codice}`
      )}
    </Badge>
  );
};

/**
 * Versione memorizzata del componente CodiceProdotto
 */
export const CodiceProdotto = memo(CodiceProdottoBase);

// La funzione precaricaCodici è stata rimossa poiché è duplicata e non utilizzata.
// Utilizziamo direttamente precaricaCodiciProdotto da @/lib/supabase che è più ottimizzata.