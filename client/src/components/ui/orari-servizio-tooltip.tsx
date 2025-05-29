import React, { useState, useEffect } from "react";
import { Info, Clock, Calendar, Loader2 } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger, 
  TooltipProvider 
} from "@/components/ui/tooltip";
import { getInfoOrderDelivery } from "@/lib/supabase";
import logger from "@/lib/logger";
import { useIsMobile } from "@/hooks/use-mobile";

// Logger dedicato per il componente
const orariLogger = logger.createLogger("OrariServizio");

// Funzione per formattare il nome del giorno con iniziale maiuscola
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

interface OrariServizioTooltipProps {
  className?: string;
  triggerClassName?: string;
  iconSize?: number;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function OrariServizioTooltip({ 
  className = "", 
  triggerClassName = "", 
  iconSize = 16,
  side = "top",
  align = "center"
}: OrariServizioTooltipProps) {
  const [orarioInizio, setOrarioInizio] = useState<string | null>(null);
  const [orarioFine, setOrarioFine] = useState<string | null>(null);
  const [giorniEsclusi, setGiorniEsclusi] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const isMobile = useIsMobile();

  // Funzione per recuperare i dati dal servizio
  const fetchOrariServizio = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // Usa la funzione getInfoOrderDelivery che gestisce la cache internamente
      // Passa il parametro forceRefresh per decidere se ignorare la cache
      const result = await getInfoOrderDelivery(forceRefresh);
      
      if (result) {
        setOrarioInizio(result.orario_inizio);
        setOrarioFine(result.orario_fine);
        setGiorniEsclusi(result.giorni_esclusi || []);
      } else {
        setError("Impossibile recuperare gli orari di servizio");
        orariLogger.error("Nessun dato ricevuto per gli orari di servizio");
      }
    } catch (err) {
      setError("Errore nel caricamento degli orari");
      orariLogger.error("Errore nel caricamento degli orari di servizio:", err);
    } finally {
      setLoading(false);
    }
  };

  // Effetto per recuperare i dati al mount iniziale
  useEffect(() => {
    // Al primo caricamento, usa la cache se disponibile
    fetchOrariServizio(false);
  }, []); // Eseguito solo al mount

  // Contenuto delle informazioni sugli orari
  const InfoContent = () => {
    if (loading) {
      return (
        <div className="flex items-center text-xs mt-1">
          <Loader2 className="animate-spin h-3 w-3 mr-1.5 text-slate-500" />
          Caricamento informazioni...
        </div>
      );
    }
    
    if (error) {
      return <div className="text-xs text-red-500">{error}</div>;
    }
    
    if (orarioInizio && orarioFine) {
      return (
        <div className="space-y-2 text-xs">
          <div className="flex items-center">
            <Clock className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            <span>
              <strong>Orari ordini:</strong> {orarioInizio} - {orarioFine}
            </span>
          </div>
          
          <div className="flex items-start">
            <Calendar className="h-3.5 w-3.5 mr-1.5 mt-0.5 text-slate-500" />
            <span>
              <strong>Giorni esclusi:</strong><br/>
              {giorniEsclusi.length > 0 
                ? giorniEsclusi.map(capitalize).join(", ")
                : "Nessun giorno escluso"}
            </span>
          </div>
          
          <div className="text-xs text-slate-500 italic mt-1">
            Al di fuori di queste fasce orarie o nei giorni esclusi
            non sarà possibile inviare ordini.
          </div>
        </div>
      );
    }
    
    return <div className="text-xs">Informazioni non disponibili</div>;
  };

  // Per dispositivi mobili: utilizziamo i componenti Dialog di shadcn
  if (isMobile) {
    // Gestione del click sull'icona: alterna lo stato del popup e forza il refresh dei dati
    const handleIconClick = () => {
      // Se stiamo aprendo il popup, facciamo un refresh forzato dei dati
      if (!isPopupOpen) {
        fetchOrariServizio(true); // Forza refresh quando si apre il popup
      }
      setIsPopupOpen(!isPopupOpen);
    };
    
    return (
      <>
        <button 
          className={`bg-transparent border-0 p-0 cursor-pointer flex items-center justify-center ${triggerClassName}`}
          onClick={handleIconClick}
          aria-label="Mostra informazioni di servizio"
        >
          <Info 
            size={iconSize} 
            className="text-slate-400 hover:text-slate-600 transition-colors" 
          />
        </button>
        
        {isPopupOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setIsPopupOpen(false)}
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
            <div 
              className={`relative z-50 p-4 rounded-md border bg-white shadow-md w-[90%] max-w-md ${className}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="orari-servizio-titolo"
            >
              <button 
                className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
                onClick={() => setIsPopupOpen(false)}
                aria-label="Chiudi"
              >
                <span aria-hidden="true">&times;</span>
              </button>
              
              <div id="orari-servizio-titolo" className="text-sm font-medium border-b pb-2 mb-2 flex items-center">
                <Info className="h-4 w-4 mr-1.5 text-slate-600" />
                Informazioni di servizio
              </div>
              
              <InfoContent />
            </div>
          </div>
        )}
      </>
    );
  }
  
  // Su desktop: usa Tooltip che si apre con hover
  // Gestione dell'hover sull'icona per aggiornare i dati
  const handleHover = () => {
    // Aggiorna i dati solo se non sono già in caricamento
    if (!loading) {
      fetchOrariServizio(true); // Forza refresh quando si hovera sull'icona
    }
  };
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button 
            className={`bg-transparent border-0 p-0 cursor-pointer ${triggerClassName}`}
            aria-label="Mostra informazioni di servizio"
            onMouseEnter={handleHover} // Aggiorna i dati quando si passa il mouse sopra
          >
            <Info 
              size={iconSize} 
              className="text-slate-400 hover:text-slate-600 transition-colors" 
            />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side={side} 
          align={align} 
          className={`p-4 max-w-xs z-50 ${className}`}
          sideOffset={8}
        >
          <div className="text-sm font-medium border-b pb-2 mb-2 flex items-center">
            <Info className="h-4 w-4 mr-1.5 text-slate-600" />
            Informazioni di servizio
          </div>
          <InfoContent />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}