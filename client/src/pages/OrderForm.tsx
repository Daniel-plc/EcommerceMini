import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { supabase, getCartItems, removeFromCart, updateCartItemQuantity,
clearCart, getImmagineProdottoDinamica, precaricaCodiciProdotto, getCodiceProdotto } from "@/lib/supabase";
import { CartItem } from "@/lib/model";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseAuth } from "@/hooks/useSupabase";
import { StatoInvioOrdine } from "@shared/schema";
import { formatConfigurazione } from "@/lib/utils";
import "./scrollbar.css";
import { CodiceProdotto } from "@/components/ui/codice-prodotto";
import { OrariServizioTooltip } from "@/components/ui/orari-servizio-tooltip";
import logger from "@/lib/logger";

// Logger specifico per la pagina OrderForm
const orderLogger = logger.createLogger('OrderForm');

const OrderForm = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  // Stato per determinare se il carrello è in fase di inizializzazione
  const [inizializzazione, setInizializzazione] = useState(true);
  type StatoOrdineType = StatoInvioOrdine | null;
  const [statoOrdine, setStatoOrdine] = useState<StatoOrdineType>(null);
  const [statoOrdineError, setStatoOrdineError] = useState<string | null>(null);
  const [fetchingStato, setFetchingStato] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showSvuotaModal, setShowSvuotaModal] = useState(false);
  // Nuovo stato per coordinare il caricamento dei codici prodotto
  const [codiciProdottoCaricati, setCodiciProdottoCaricati] = useState(false);
  
  // ✨ Sistema di debounce intelligente per quantità carrello
  const [tempQuantities, setTempQuantities] = useState<Record<number, number>>({});
  const debounceTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const lastQuantities = useRef<Record<number, number>>({});
  
  // Gli orari di servizio sono ora gestiti dal componente OrariServizioTooltip
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, sessionLoaded } = useSupabaseAuth();

  // ✨ Cleanup dei timer quando il componente viene smontato
  useEffect(() => {
    return () => {
      // Pulisci tutti i timer attivi quando il componente viene smontato
      Object.values(debounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  useEffect(() => {
    // Funzione per caricare il carrello con le immagini corrette e precarica codici
    const loadCartWithOptimizedImages = async () => {
      // Attiviamo lo stato di inizializzazione durante il caricamento
      setInizializzazione(true);
      const cartItems = getCartItems();
      
      // Per ogni elemento del carrello, assicuriamoci che l'immagine sia corretta
      if (cartItems.length > 0) {
        // Estrai gli ID prodotto per il precaricamento in batch
        const productIds = cartItems.map(item => item.product.id)
          .filter((id, index, self) => self.indexOf(id) === index); // Deduplica
        
        // Precarica i codici prodotto in parallelo e attendi il completamento
        if (productIds.length > 0) {
          try {
            // Reset dello stato di caricamento
            setCodiciProdottoCaricati(false);
            
            // Precarica tutti i codici prodotto e attendi il completamento
            await precaricaCodiciProdotto(productIds);
            
            // Ora precarica anche tutte le configurazioni specifiche di ciascun articolo
            const precaricaCodiciConfigurazione = async () => {
              // Crea un array di promesse per tutti i codici prodotto per ogni articolo con la sua configurazione
              const codiciPromises = cartItems.map(item => 
                getCodiceProdotto(item.product.id, item.configurazione || {})
                  .catch((e: Error) => {
                    orderLogger.warn(`Errore nel precaricamento codice per prodotto ${item.product.id}:`, e);
                    return null;
                  })
              );
              
              // Attendi che tutti i codici siano caricati
              await Promise.all(codiciPromises);
            };
            
            // Esegui il precaricamento delle configurazioni specifiche
            await precaricaCodiciConfigurazione();
            
            // Imposta lo stato a "caricati" per informare i componenti che possono mostrare i codici
            setCodiciProdottoCaricati(true);
            orderLogger.debug("Tutti i codici prodotto sono stati precaricati con successo");
          } catch (err) {
            orderLogger.error("Errore nel precaricamento codici prodotto:", err);
            // In caso di errore, segniamo comunque come completato
            setCodiciProdottoCaricati(true);
          }
        } else {
          // Se non ci sono prodotti, i codici sono già "caricati"
          setCodiciProdottoCaricati(true);
        }
        
        const itemsWithOptimizedImages = await Promise.all(
          cartItems.map(async (item) => {
            // Usa la versione ottimizzata solo se non è già specificata un'immagine personalizzata
            if (!item.immagine_url && item.configurazione) {
              const optimizedImage = await getImmagineProdottoDinamica(
                item.product.id,
                item.configurazione
              );
              
              if (optimizedImage) {
                return { ...item, immagine_url: optimizedImage };
              }
            }
            return item;
          })
        );
        
        setCart(itemsWithOptimizedImages);
        // Terminiamo l'inizializzazione dopo aver completato il caricamento del carrello
        setInizializzazione(false);
      } else {
        setCart(cartItems);
        // Terminiamo l'inizializzazione anche se il carrello è vuoto
        setInizializzazione(false);
      }
    };
    
    // Carica il carrello all'avvio
    loadCartWithOptimizedImages();

    // Listen for cart updates
    const handleCartUpdate = () => {
      loadCartWithOptimizedImages();
    };

    window.addEventListener("cartUpdated", handleCartUpdate);
    window.addEventListener("storage", handleCartUpdate);

    return () => {
      window.removeEventListener("cartUpdated", handleCartUpdate);
      window.removeEventListener("storage", handleCartUpdate);
    };
  }, []);
  
  // Effetto per gestire il pulsante "Torna su"
  useEffect(() => {
    const handleScroll = () => {
      // Mostra il pulsante solo dopo aver scrollato di 300px
      setShowScrollTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    
    // Controlla anche all'avvio
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Il caricamento degli orari di servizio è gestito direttamente dal componente OrariServizioTooltip

  // Effetto per recuperare lo stato dell'invio ordine usando supabase.rpc()
  // con ottimizzazione "stale-while-revalidate" e attesa caricamento sessione
  useEffect(() => {
    // Funzione per recuperare lo stato ordini dal server
    const fetchStatoOrdine = async () => {
      try {
        // Se l'utente non è autenticato, non possiamo recuperare i dati
        if (!user?.id) {
          orderLogger.warn("Utente non autenticato o ID non valido");
          setStatoOrdineError(
            "Per visualizzare lo stato ordini devi effettuare l'accesso",
          );
          return;
        }
        
        // Chiave cache specifica per l'utente e il giorno corrente
        const cacheKey = `stato_${user.id}_${new Date().toISOString().slice(0,10)}`;
        
        // Controlla se c'è una cache valida per oggi
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            // Usa immediatamente i dati in cache senza mostrare il loader
            const parsedData = JSON.parse(cachedData);
            setStatoOrdine(parsedData);
            // Non c'è bisogno di mostrare il loader se abbiamo dati in cache
            
            // Contrassegniamo la fetch di refresh come "in background"
            const isBackgroundRefresh = true;
            // Continuiamo con la fetch per aggiornare i dati (revalidate)
            await refreshStatoOrdine(user.id, cacheKey, isBackgroundRefresh);
            return;
          } catch (e) {
            // Se c'è un errore nel parsing, ignora la cache
            sessionStorage.removeItem(cacheKey);
          }
        }
        
        // Se non c'è cache o è invalida, mostra il loader e carica
        await refreshStatoOrdine(user.id, cacheKey, false);
      } catch (error: any) {
        orderLogger.error("Errore nel recupero dello stato ordine:", error);
        setStatoOrdineError(
          "⚠️ Errore nel recupero stato ordine. Riprova più tardi.",
        );
        setFetchingStato(false);
      }
    };
    
    // Funzione separata per aggiornare i dati dal server
    const refreshStatoOrdine = async (userId: string, cacheKey: string, isBackground: boolean = false) => {
      // Mostra loader solo se non è un refresh in background
      if (!isBackground) {
        setFetchingStato(true);
        setStatoOrdineError(null);
      }
      
      try {
        // Chiamata RPC alla funzione stato_invio_ordine_rpc
        const { data, error } = await supabase.rpc("stato_invio_ordine_rpc", {
          user_id: userId,
        });

        if (error) {
          orderLogger.error(
            "Errore chiamata RPC stato_invio_ordine:",
            error.message,
          );
          throw error;
        }
        
        // La funzione RPC restituisce un array, prendiamo il primo elemento
        const statoData = data[0] || null;
        
        // Aggiorna lo stato
        setStatoOrdine(statoData);
        
        // Salva in cache per la giornata corrente
        if (statoData) {
          sessionStorage.setItem(cacheKey, JSON.stringify(statoData));
        }
      } finally {
        if (!isBackground) {
          setFetchingStato(false);
        }
      }
    };

    // Avvia la fetch solo quando sia l'utente che la sessione sono caricati
    if (sessionLoaded) {
      if (user) {
        fetchStatoOrdine();
      } else {
        setStatoOrdineError(
          "Per visualizzare lo stato ordini devi effettuare l'accesso",
        );
      }
    }
  }, [sessionLoaded, user]);

  const handleRemoveItem = (index: number) => {
    removeFromCart(index);
    // Riutilizziamo la stessa funzione ottimizzata che carica le immagini 
    const cartItems = getCartItems();
    setCart(cartItems);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    updateCartItemQuantity(index, quantity);
    // Nessun bisogno di ricaricare le immagini, manteniamo la cache attuale
    const cartItems = getCartItems();
    setCart(cartItems);
  };

  // ✨ Funzione di aggiornamento ibrida con debounce intelligente
  const updateQuantityWithSmartDebounce = useCallback((index: number, newQuantity: number) => {
    const currentQuantity = lastQuantities.current[index] || cart[index]?.quantity || 0;
    const isDecreasing = newQuantity < currentQuantity;
    
    // Aggiorna la quantità temporanea per la visualizzazione immediata
    setTempQuantities(prev => ({
      ...prev,
      [index]: newQuantity
    }));
    
    // Cancella timer esistente per questo indice
    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index]);
      delete debounceTimers.current[index];
    }
    
    // Strategia ibrida:
    // 1. Aggiornamento immediato per decrementi
    // 2. Debounce di 600ms per incrementi
    if (isDecreasing || newQuantity === 0) {
      // Aggiornamento immediato per valori in decrescita
      handleQuantityChange(index, newQuantity);
      lastQuantities.current[index] = newQuantity;
      // Rimuovi dalla quantità temporanea
      setTempQuantities(prev => {
        const newTemp = { ...prev };
        delete newTemp[index];
        return newTemp;
      });
    } else {
      // Debounce per valori in crescita
      debounceTimers.current[index] = setTimeout(() => {
        handleQuantityChange(index, newQuantity);
        lastQuantities.current[index] = newQuantity;
        // Rimuovi dalla quantità temporanea
        setTempQuantities(prev => {
          const newTemp = { ...prev };
          delete newTemp[index];
          return newTemp;
        });
        delete debounceTimers.current[index];
      }, 600);
    }
  }, [cart]);

  // ✨ Funzione per forzare l'aggiornamento immediato (blur/enter)
  const forceUpdateQuantity = useCallback((index: number, newQuantity: number) => {
    // Cancella qualsiasi timer pending
    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index]);
      delete debounceTimers.current[index];
    }
    
    // Aggiornamento immediato
    handleQuantityChange(index, newQuantity);
    lastQuantities.current[index] = newQuantity;
    
    // Rimuovi dalla quantità temporanea
    setTempQuantities(prev => {
      const newTemp = { ...prev };
      delete newTemp[index];
      return newTemp;
    });
  }, []);
  
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  const handleShowConfirmModal = (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Devi effettuare l'accesso per confermare l'ordine.",
      });
      return;
    }

    if (cart.length === 0) {
      toast({
        variant: "destructive",
        title: "Errore",
        description:
          "Il carrello è vuoto. Aggiungi prodotti prima di confermare l'ordine.",
      });
      return;
    }

    // Mostra il modale di conferma
    setShowConfirmModal(true);
  };
  
  const handleConfirmOrder = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    orderLogger.info("Avvio processo di conferma ordine");
    let orderId: number | null = null;

    try {
      // Verifica che l'utente sia autenticato
      if (!user) {
        throw new Error("Devi effettuare l'accesso per confermare l'ordine.");
      }
      
      // Verifica server-side se si può ancora ordinare
      const { data: check, error: checkError } = await supabase.rpc(
        "stato_invio_ordine_rpc",
        { user_id: user.id },
      );

      if (checkError || !check || check.length === 0) {
        throw new Error(
          "Impossibile verificare lo stato dell'invio ordine. Riprova più tardi.",
        );
      }

      const stato = check[0];
      if (!stato.giorno_valido) {
        throw new Error(
          "Ordini non disponibili in questo momento. Controlla orari e festività.",
        );
      }

      if (stato.ordini_oggi >= stato.max_ordini_giornalieri) {
        throw new Error(
          "Hai già raggiunto il limite massimo di ordini per oggi.",
        );
      }

      // 1. Create a new order with initial status "In elaborazione"
      const { data: orderData, error: orderError } = await supabase
        .from("ordini")
        .insert({
          utente_id: user.id,
          data: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      orderId = orderData.id;

      // 2. Create order lines for each item in the cart
      const orderLines = cart.map((item) => ({
        ordine_id: orderData.id,
        prodotto_id: item.product.id,
        quantità: item.quantity, // Corretto con l'accento per adattarsi al DB Supabase
        configurazione: item.configurazione,
      }));

      const { error: linesError } = await supabase
        .from("righe_ordine")
        .insert(orderLines);

      if (linesError) {
        // Se c'è un errore nell'inserimento delle righe, aggiorna lo stato a "Errore"
        await supabase
          .from("ordini")
          .update({ stato: "Errore" })
          .eq("id", orderData.id);

        throw linesError;
      }

      // 3. Aggiorna lo stato dell'ordine a "Inviato" se tutto è andato a buon fine
      const { error: updateError } = await supabase
        .from("ordini")
        .update({ stato: "Inviato" })
        .eq("id", orderData.id);

      if (updateError) {
        // Rimosso log di debug
        // Continuiamo comunque l'esecuzione perché l'ordine è stato creato correttamente
      }

      // 4. Clear the cart
      clearCart();
      orderLogger.info(`Ordine #${orderData.id} creato con successo e carrello svuotato`);

      // 5. Show success message and redirect
      toast({
        title: "Ordine confermato",
        description:
          "Il tuo ordine è stato ricevuto e verrà elaborato al più presto.",
      });

      orderLogger.info("Redirect alla pagina storico ordini");
      setLocation("/history");
    } catch (error: any) {
      // Se l'errore non è relativo all'inserimento delle righe d'ordine e abbiamo un ID ordine
      // aggiorniamo lo stato a "Errore" (nel caso in cui l'ordine sia stato creato ma poi è fallito qualcos'altro)
      if (orderId) {
        try {
          await supabase
            .from("ordini")
            .update({ stato: "Errore" })
            .eq("id", orderId);
        } catch (updateError) {
          // Rimosso log di debug
        }
      }

      toast({
        variant: "destructive",
        title: "Errore",
        description:
          "Si è verificato un errore durante la conferma dell'ordine. " +
          error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Mostriamo un indicatore di caricamento durante l'inizializzazione
  if (inizializzazione) {
    return (
      <div className="container py-4 sm:py-6 md:py-8">
        <h2 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 md:mb-6">Riepilogo Ordine</h2>
        
        <div className="card p-4 sm:p-6 md:p-8 flex items-center justify-center">
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <svg 
                className="animate-spin h-10 w-10 text-slate-400" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                ></circle>
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <p className="text-slate-600 font-medium">Caricamento del tuo ordine...</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Dopo l'inizializzazione, se il carrello è vuoto mostriamo il messaggio appropriato
  if (cart.length === 0) {
    return (
      <div className="container py-4 sm:py-6 md:py-8">
        <h2 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 md:mb-6">Riepilogo Ordine</h2>

        <div className="card p-4 sm:p-6 text-center">
          <div className="py-6 sm:py-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-10 w-10 sm:h-12 sm:w-12 text-slate-300" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1.5}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" 
                />
              </svg>
            </div>
            <h3 className="mt-2 text-base sm:text-lg font-medium text-slate-800">
              Il tuo ordine è vuoto
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 mb-5 sm:mb-6">
              Aggiungi prodotti dalla sezione Prodotti
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => setLocation("/products")}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
                Vai ai prodotti
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 sm:py-6 md:py-8">
      <h2 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 md:mb-6">Riepilogo Ordine</h2>
      
      {/* Rimosso il pulsante "Torna in alto" perché non necessario in questa pagina */}

      {/* Modale di conferma ordine */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 md:p-6">
              <div className="flex items-center justify-center mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-5 w-5 sm:h-6 sm:w-6" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-center mb-2">Conferma il tuo ordine</h3>
              <div className="text-xs sm:text-sm text-slate-600 space-y-2 sm:space-y-3 mb-4 sm:mb-5">
                <p>
                  Stai per inviare un ordine con <strong>{cart.reduce((acc, item) => acc + item.quantity, 0)} prodotti</strong>.
                </p>
                <p className="text-amber-600 border-l-4 border-amber-300 pl-2 sm:pl-3 py-1.5 sm:py-2 bg-amber-50 text-[11px] sm:text-xs">
                  <strong>Importante:</strong> Per questioni amministrative, non sarà possibile aggiungere o modificare prodotti al momento del ritiro. L'ordine che confermi adesso sarà definitivo.
                </p>
                <p>
                  Se sei sicuro di voler procedere, clicca su "Confermo" per inviare l'ordine.
                </p>
              </div>
              <div className="flex space-x-2 sm:space-x-3 md:space-x-4">
                <button
                  type="button"
                  className="flex-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors text-xs sm:text-sm"
                  onClick={() => setShowConfirmModal(false)}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  className="flex-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-md transition-colors text-xs sm:text-sm font-medium"
                  onClick={handleConfirmOrder}
                >
                  Confermo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonna sinistra: Prodotti nel carrello */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden mb-6">
            <div className="p-3 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-semibold">Prodotti nel carrello</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowSvuotaModal(true)}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline flex items-center mr-2"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-3.5 w-3.5 mr-0.5" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  Svuota
                </button>
                <span className="text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center">
                  <span className="hidden xs:inline">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)} prodotti
                  </span>
                  <span className="xs:hidden flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                    </svg>
                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                  </span>
                </span>
              </div>
            </div>
            <div className="max-h-[calc(70vh-8rem)] overflow-y-auto">
              <ul className="divide-y divide-slate-200">
                {cart.map((item, index) => (
                  <li
                    key={index}
                    className="p-4 sm:px-5 sm:py-4 flex items-start"
                  >
                  <div className="flex-shrink-0 mr-3">
                    <img
                      src={item.immagine_url || item.product.immagine_url}
                      alt={item.product.nome}
                      className="h-16 w-16 rounded-md object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://placehold.co/80?text=No+Image";
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <div className="flex items-center">
                        <h4 className="text-base font-medium text-slate-800 truncate">
                          {item.product.nome}
                        </h4>
                        {/* Mostra il codice prodotto solo quando tutti i codici sono caricati 
                           per garantire che entrambe le sezioni siano sincronizzate */}
                        {codiciProdottoCaricati ? (
                          <CodiceProdotto 
                            prodottoId={item.product.id} 
                            configurazione={item.configurazione}
                            className="ml-2 text-[10px]"
                            prefisso="Cod."
                            priority={true}
                          />
                        ) : (
                          <span className="ml-2 bg-slate-100 text-slate-400 text-[10px] font-medium px-1.5 py-0.5 rounded">
                            <span className="inline-block animate-pulse">Caricamento...</span>
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-slate-400 hover:text-red-500 transition-colors ml-2 p-1 rounded-full hover:bg-slate-100"
                        aria-label="Rimuovi prodotto"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                    
                    {item.configurazione && (
                      <div className="text-xs text-slate-600 mt-1.5 mb-2 flex flex-wrap">
                        {/* Utilizziamo formatConfigurazione per avere coerenza con il resto dell'app */}
                        {formatConfigurazione(item.configurazione, item.product.id).map((formattedProperty, i) => {
                          // Estrai chiave e valore dalla stringa formattata (formato: "Chiave: Valore")
                          const colonPos = formattedProperty.indexOf(': ');
                          const chiave = formattedProperty.substring(0, colonPos); 
                          const valore = formattedProperty.substring(colonPos + 2);
                          
                          return (
                            <div
                              key={i}
                              className="inline-block mr-1.5 mb-1 bg-slate-50 rounded px-1 py-0.5 border border-slate-100"
                            >
                              {/* Nome completo su desktop, abbreviato su mobile */}
                              <span className="font-medium">
                                <span className="hidden sm:inline">
                                  {chiave}:
                                </span>
                                <span className="sm:hidden">
                                  {chiave.length > 8 ? chiave.slice(0, 6) + "." : chiave}:
                                </span>
                              </span>
                              <span className="ml-0.5">{valore}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    <div className="flex items-center mt-2">
                      <div className="flex items-center border border-slate-200 rounded">
                        <button
                          onClick={() =>
                            item.quantity > 1 &&
                            handleQuantityChange(index, item.quantity - 1)
                          }
                          className="px-2 py-0.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 overflow-visible rounded-sm"
                          aria-label="Diminuisci quantità"
                        >
                          <span className="text-sm inline-flex h-full w-full items-center justify-center">−</span>
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={
                            tempQuantities[index] !== undefined 
                              ? (tempQuantities[index] === 0 ? "" : tempQuantities[index])
                              : (item.quantity === 0 ? "" : item.quantity)
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            // Solo aggiorna la visualizzazione temporanea, senza toccare il carrello
                            if (value === "") {
                              setTempQuantities(prev => ({ ...prev, [index]: 0 }));
                              return;
                            }

                            const cleaned = value.replace(/\D/g, "");
                            const parsed = parseInt(cleaned, 10);

                            if (isNaN(parsed)) {
                              setTempQuantities(prev => ({ ...prev, [index]: 0 }));
                            } else if (parsed > 9999) {
                              setTempQuantities(prev => ({ ...prev, [index]: 9999 }));
                            } else {
                              setTempQuantities(prev => ({ ...prev, [index]: parsed }));
                            }
                          }}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value || "0", 10);
                            if (!value || value < 1) {
                              forceUpdateQuantity(index, 1);
                            } else {
                              forceUpdateQuantity(index, value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur(); // Forza il blur per applicare il valore
                            }
                          }}
                          className="w-10 h-7 text-center border-0 focus:ring-1 focus:ring-primary focus:border-primary text-xs font-medium"
                          aria-label="Quantità"
                        />
                        <button
                          onClick={() =>
                            handleQuantityChange(index, item.quantity + 1)
                          }
                          className="px-2 py-0.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 overflow-visible rounded-sm"
                          aria-label="Aumenta quantità"
                        >
                          <span className="text-sm inline-flex h-full w-full items-center justify-center">+</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          </div>
        </div>

        {/* Colonna destra: Riepilogo e conferma */}
        <div className="lg:col-span-1">
          <div className="card p-4 sm:p-5 sticky top-24 order-summary">
            {/* Stato dell'ordine */}
            {user && (
              <div className="mb-5">
                <div className="flex items-center space-x-2 mb-3">
                  <h3 className="text-base font-medium text-slate-800">Stato dell'ordine</h3>
                  <OrariServizioTooltip 
                    side="right" 
                    align="start"
                    iconSize={16}
                    className="z-50"
                  />
                </div>
                {fetchingStato ? (
                  <div className="animate-in fade-in duration-200">
                    <div className="flex items-center justify-center text-xs text-slate-500 p-2">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Verifica stato ordine...
                    </div>
                  </div>
                ) : statoOrdineError ? (
                  <div className="text-amber-600 text-xs p-2 bg-amber-50 rounded">
                    {statoOrdineError}
                  </div>
                ) : (
                  statoOrdine && (
                    <div>
                      {!statoOrdine.giorno_valido ? (
                        <div className="flex items-center p-2 bg-amber-50 text-amber-700 text-xs rounded">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-2 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                          <span>
                            Ordini non disponibili in questo momento.
                          </span>
                        </div>
                      ) : statoOrdine.ordini_oggi >= statoOrdine.max_ordini_giornalieri ? (
                        <div className="flex items-center p-2 bg-red-50 text-red-700 text-xs rounded">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-2 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                          <span>
                            Hai raggiunto il limite di{" "}
                            <strong>{statoOrdine.max_ordini_giornalieri} ordini</strong>{" "}
                            per oggi.
                          </span>
                        </div>
                      ) : (
                        <div className="border border-green-200 rounded bg-green-50 px-3 py-2 animate-in fade-in duration-200">
                          <div className="flex items-center text-green-700 text-xs">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-4 h-4 mr-1.5 flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="font-medium">
                              Ordine disponibile
                            </span>
                          </div>
                          <div className="mt-1 text-green-700 text-xs flex items-center justify-between">
                            <span>Ordini effettuati oggi:</span>
                            <span className="font-medium">{statoOrdine.ordini_oggi} di {statoOrdine.max_ordini_giornalieri}</span>
                          </div>
                          <div className="mt-1.5 w-full bg-green-200 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-green-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                              style={{ 
                                width: `${(statoOrdine.ordini_oggi / statoOrdine.max_ordini_giornalieri) * 100}%` 
                              }}
                            ></div>
                          </div>
                          <div className="mt-1 text-xs text-green-800 font-medium text-center">
                            Puoi ancora inviare {statoOrdine.max_ordini_giornalieri - statoOrdine.ordini_oggi} {
                              statoOrdine.max_ordini_giornalieri - statoOrdine.ordini_oggi === 1 ? "ordine" : "ordini"
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Riepilogo prodotti */}
            <div className="mb-5">
              <h3 className="text-sm sm:text-base font-medium text-slate-800 mb-2 sm:mb-3">Riepilogo prodotti</h3>
              <div className="scrollable-container">
                <ul className="divide-y divide-dashed divide-slate-200 text-sm">
                {cart.map((item, index) => (
                  <li key={index} className="py-1.5 sm:py-2 flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-center max-w-[calc(100%-40px)]">
                          <p className="text-xs sm:text-sm font-medium text-slate-700 truncate pr-2">
                            {item.product.nome}
                          </p>
                          {/* Utilizziamo lo stesso stato di caricamento per sincronizzare entrambe le sezioni */}
                          {codiciProdottoCaricati ? (
                            <CodiceProdotto 
                              prodottoId={item.product.id} 
                              configurazione={item.configurazione} 
                              className="ml-1 text-[10px]" 
                              prefisso="Cod."
                              priority={true}
                            />
                          ) : (
                            <span className="ml-1 bg-slate-100 text-slate-400 text-[10px] font-medium px-1.5 py-0.5 rounded">
                              <span className="inline-block animate-pulse">Caricamento...</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-600 whitespace-nowrap">
                          × {item.quantity}
                        </p>
                      </div>
                      {Object.keys(item.configurazione).length > 0 && (
                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap">
                          {/* Utilizziamo lo stesso approccio con formatConfigurazione anche qui */}
                          {formatConfigurazione(item.configurazione, item.product.id).map((formattedProperty, i) => {
                            // Estrai chiave e valore dalla stringa formattata
                            const colonPos = formattedProperty.indexOf(': ');
                            const chiave = formattedProperty.substring(0, colonPos); 
                            const valore = formattedProperty.substring(colonPos + 2);
                            
                            return (
                              <div
                                key={i}
                                className="inline-block mr-1.5 mb-1 bg-slate-50 rounded px-1 py-0.5 border border-slate-100"
                              >
                                <span className="font-medium">
                                  <span className="hidden sm:inline">
                                    {chiave}:
                                  </span>
                                  <span className="sm:hidden">
                                    {chiave.length > 8 ? chiave.slice(0, 6) + "." : chiave}:
                                  </span>
                                </span>
                                <span className="ml-0.5">{valore}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              </div>
            </div>
            
            {/* Totale */}
            <div className="mt-4 sm:mt-6 border-t border-slate-200 pt-3 sm:pt-4">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <span className="text-sm sm:text-base font-medium text-slate-800">Totale prodotti</span>
                <div className="flex items-center">
                  <span className="text-base sm:text-lg font-bold text-primary">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Pulsante conferma */}
            <form onSubmit={handleShowConfirmModal}>
              <div className="mt-2">
                <button
                  type="submit"
                  className={`w-full flex items-center justify-center px-3 sm:px-4 py-2 rounded-md text-white bg-primary hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 text-sm sm:text-base font-medium order-confirm-button ${
                    loading || !user || cart.length === 0
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  disabled={loading || !user || cart.length === 0}
                  aria-label={
                    loading
                      ? "Elaborazione in corso..."
                      : cart.length === 0
                        ? "Impossibile inviare: carrello vuoto"
                        : !user
                          ? "Accedi per confermare"
                          : "Conferma ordine"
                  }
                >
                  {loading ? (
                    <div className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span className="text-xs sm:text-sm">Elaborazione...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-sm sm:text-base">Conferma Ordine</span>
                    </div>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      {/* Modale per svuotare il carrello */}
      {showSvuotaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded max-w-md w-full shadow-lg overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5">
              <p className="text-sm sm:text-base text-center mb-3">Sei sicuro di voler svuotare il carrello?</p>
              <div className="flex justify-center space-x-3">
                <button
                  onClick={() => setShowSvuotaModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={() => {
                    clearCart();
                    setCart([]);
                    setShowSvuotaModal(false);
                    toast({
                      title: "Carrello svuotato",
                      description: "Tutti i prodotti sono stati rimossi dal carrello."
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderForm;