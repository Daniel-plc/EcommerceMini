import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { supabase, getCodiceProdotto, precaricaCodiciProdotto, addToCart, getCartKey } from "@/lib/supabase";
import { getImmagineProdottoDinamicaOptimized, precaricaImmaginiProdotti } from "@/lib/image-cache";
import { useSupabaseAuth } from "@/hooks/useSupabase";
import { useToast } from "@/hooks/use-toast";
import { RigaOrdine, StoricoOrdine, CartItem } from "@/lib/model";
import { generateOrderPDF } from "@/lib/pdf";
import { formatConfigurazione, normalizzaChiaviConfigurazione } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckablePdfDialog } from "@/components/ui/checkable-pdf-dialog";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { Input } from "@/components/ui/input";
import { Search, ShoppingCart, FileDown, Check } from "lucide-react";
import { CodiceProdotto } from "@/components/ui/codice-prodotto";
import logger from "@/lib/logger";

// Logger specifico per la pagina OrderHistory
const historyLogger = logger.createLogger('OrderHistory');

const OrderHistory = () => {
  const [orders, setOrders] = useState<StoricoOrdine[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<StoricoOrdine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<StoricoOrdine | null>(null);
  const [searchDate, setSearchDate] = useState("");
  const [reorderingId, setReorderingId] = useState<number | null>(null); // Traccia l'ordine in corso di riordino
  
  // Parametri per il caricamento progressivo (lazy loading)
  const [visibleOrders, setVisibleOrders] = useState<number>(10); // Numero iniziale di ordini visibili
  const [hasMore, setHasMore] = useState<boolean>(true); // Indica se ci sono altri ordini da caricare
  const [, setLocation] = useLocation();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);
  
  // Utilizziamo useMemo per memorizzare i risultati di ricerca e migliorare le prestazioni
  // evitando ricalcoli non necessari quando altri stati cambiano ma non la ricerca o gli ordini
  const filteredOrdersMemo = useMemo(() => {
    if (!searchDate.trim()) {
      // Se il campo di ricerca è vuoto, restituiamo tutti gli ordini
      return orders;
    }
    
    // Cerca ordini per data 
    const searchTerm = searchDate.trim().toLowerCase();
    
    return orders.filter(order => {
      // Formatta la data dell'ordine in vari formati per una ricerca più flessibile
      const orderDate = new Date(order.data_ordine);
      const formattedDate = format(orderDate, "d MMMM yyyy", { locale: it }).toLowerCase();
      const shortDate = format(orderDate, "dd/MM/yyyy").toLowerCase();
      const monthYear = format(orderDate, "MMMM yyyy", { locale: it }).toLowerCase();
      
      // Cerca corrispondenze nei vari formati di data
      return formattedDate.includes(searchTerm) || 
             shortDate.includes(searchTerm) ||
             monthYear.includes(searchTerm);
    });
  }, [searchDate, orders]);
  
  // Aggiorniamo filtered orders quando cambia il risultato memorizzato
  useEffect(() => {
    setFilteredOrders(filteredOrdersMemo);
    
    // Aggiorniamo anche lo stato hasMore in base al numero di ordini disponibili
    setHasMore(filteredOrdersMemo.length > visibleOrders);
  }, [filteredOrdersMemo, visibleOrders]);
  
  // Funzione per caricare più ordini (lazy loading)
  const loadMoreOrders = () => {
    // Incrementa il numero di ordini visibili di 5 alla volta
    setVisibleOrders(prev => prev + 5);
  };

  // Funzione per aggiungere un ordine storico al carrello (riordino)
  const handleReorder = async (order: StoricoOrdine) => {
    if (!order || !order.righe || order.righe.length === 0) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile riordinare: ordine vuoto o non valido.",
      });
      return;
    }

    try {
      // Imposta l'ID dell'ordine in corso di riordino per gestire lo stato di caricamento
      setReorderingId(order.id);
      historyLogger.info(`Inizio riordino dell'ordine #${order.id}`);

      // Per ogni riga d'ordine, crea un elemento del carrello
      let prodottiAggiunti = 0;
      let prodottiNonDisponibili = 0;

      // Utilizziamo un loop tradizionale per gestire sequenzialmente le operazioni
      // ed evitare sovraccarichi sul browser con troppe richieste parallele
      for (const riga of order.righe) {
        // Verifica che il prodotto e la sua configurazione siano ancora disponibili
        if (!riga.prodotto_id) {
          prodottiNonDisponibili++;
          continue;
        }

        // Converte la riga ordine in formato CartItem
        // Ordiniamo le proprietà della configurazione usando formatConfigurazione per mantenere 
        // la stessa coerenza di ordinamento usata nel resto dell'applicazione
        const configurazioneOriginale = riga.configurazione || {};
        
        // Utilizziamo la funzione helper centralizzata per normalizzare le chiavi di configurazione
        // Questo garantisce coerenza in tutta l'applicazione ed elimina la duplicazione di codice
        const configurazioneOrdinata = normalizzaChiaviConfigurazione(configurazioneOriginale);
        
        const cartItem: CartItem = {
          product: {
            id: riga.prodotto_id,
            nome: riga.nome_prodotto,
            descrizione: "", // Non abbiamo la descrizione, ma non è essenziale
            immagine_url: "",
          },
          immagine_url: riga.immagine_url,
          quantity: riga.quantità,
          configurazione: configurazioneOrdinata,
        };

        // Aggiungi al carrello
        addToCart(cartItem);
        prodottiAggiunti++;
      }

      // Forza un aggiornamento esplicito del contatore nella navbar
      const userCartKey = getCartKey();
      window.dispatchEvent(new CustomEvent('cartUpdated', { 
        detail: { 
          cartKey: userCartKey, 
          forceUpdate: true 
        } 
      }));
      
      // Mostra il toast con il risultato
      if (prodottiAggiunti > 0) {
        toast({
          title: "Riordino completato",
          description: (
            <div>
              {prodottiAggiunti} prodott{prodottiAggiunti === 1 ? 'o' : 'i'} aggiunt{prodottiAggiunti === 1 ? 'o' : 'i'} al carrello.
              {prodottiNonDisponibili > 0 && (
                <span className="block mt-1 text-amber-600">
                  {prodottiNonDisponibili} prodott{prodottiNonDisponibili === 1 ? 'o' : 'i'} non disponibil{prodottiNonDisponibili === 1 ? 'e' : 'i'}.
                </span>
              )}
              <div className="mt-2">
                <button 
                  onClick={() => setLocation("/ordine")}
                  className="text-primary hover:underline text-sm font-medium"
                >
                  Vai al carrello &rarr;
                </button>
              </div>
            </div>
          ),
          duration: 5000,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Riordino non completato",
          description: "Nessun prodotto è stato aggiunto al carrello. I prodotti potrebbero non essere più disponibili.",
        });
      }
    } catch (error: any) {
      historyLogger.error(`Errore durante il riordino dell'ordine #${order.id}:`, error);
      toast({
        variant: "destructive",
        title: "Errore durante il riordino",
        description: error.message || "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      // Reset dello stato di caricamento
      setReorderingId(null);
    }
  };

  const fetchOrders = async () => {
    if (!user) return;

    try {
      historyLogger.info("Avvio caricamento storico ordini");
      setLoading(true);
      setError(null);

      // Recupera gli ordini dalla tabella principale
      const { data: ordersData, error: ordersError } = await supabase
        .from("ordini")
        .select("*")
        .order("data", { ascending: false });

      if (ordersError) {
        throw ordersError;
      }

      if (!ordersData || ordersData.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }
      
      // Ottimizzazione 1: Recupera tutte le righe di tutti gli ordini in una singola query
      // Questo riduce drasticamente il numero di richieste al database
      const ordineIds = ordersData.map(o => o.id);
      const { data: allRigheData, error: allRigheError } = await supabase
        .from("righe_ordine")
        .select("*, prodotti ( nome )")
        .in("ordine_id", ordineIds);
        
      if (allRigheError) {
        throw allRigheError;
      }
      
      // Organizziamo le righe per ordine per un accesso più veloce
      const righePerOrdine: Record<number, any[]> = {};
      for (const riga of allRigheData) {
        if (!righePerOrdine[riga.ordine_id]) {
          righePerOrdine[riga.ordine_id] = [];
        }
        righePerOrdine[riga.ordine_id].push(riga);
      }
      
      // Ottimizzazione 2: Precarichiamo TUTTI i prodotti di TUTTI gli ordini in un'unica operazione
      const tuttiProdottiIds = allRigheData
        .map(riga => riga.prodotto_id)
        .filter((id, index, self) => id && self.indexOf(id) === index); // Rimuovi duplicati
      
      if (tuttiProdottiIds.length > 0) {
        historyLogger.info(`Precaricamento di ${tuttiProdottiIds.length} prodotti in batch`);
        // Precarica in parallelo sia le immagini che i codici prodotto
        await Promise.all([
          precaricaImmaginiProdotti(tuttiProdottiIds),
          precaricaCodiciProdotto(tuttiProdottiIds)
        ]);
      }

      // Array per memorizzare gli ordini processati
      const storicoOrdini: StoricoOrdine[] = [];

      // Per ogni ordine, processa le righe già recuperate
      for (const ordine of ordersData) {
        const righeOrdine = righePerOrdine[ordine.id] || [];
        
        // Formatta le righe dell'ordine nel formato richiesto
        const righeProcessed: RigaOrdine[] = await Promise.all(
          righeOrdine.map(async (riga: any) => {
            const config = riga.configurazione || {};
            
            // Esegui operazioni in parallelo 
            const [immagine, codice_prodotto] = await Promise.all([
              getImmagineProdottoDinamicaOptimized(riga.prodotto_id, config),
              getCodiceProdotto(riga.prodotto_id, config).catch(err => {
                historyLogger.error("Errore nel recupero del codice prodotto:", err);
                return null;
              })
            ]);

            // Creiamo l'oggetto riga con la quantità mappata correttamente
            const rigaProcessata = {
              nome_prodotto: riga.prodotti?.nome || "Prodotto",
              configurazione: config,
              immagine_url: immagine || "",
              quantità: typeof riga.quantità === "number" ? riga.quantità : 0,
              prodotto_id: riga.prodotto_id, // Aggiungiamo l'ID del prodotto per l'ordinamento delle caratteristiche
            };
            
            // Aggiungiamo il codice prodotto solo se recuperato con successo
            if (codice_prodotto) {
              (rigaProcessata as any).temp_codice_prodotto = codice_prodotto;
            }
            
            return rigaProcessata;
          })
        );

        // Aggiungi l'ordine processato all'array
        storicoOrdini.push({
          id: ordine.id,
          data_ordine: ordine.data,
          stato: ordine.stato,
          utente_id: ordine.utente_id,
          righe: righeProcessed,
          n_ordine: ordine.n_ordine, // Aggiungiamo il campo n_ordine (nome corretto dalla tabella)
        });
      }

      // Imposta gli ordini processati
      setOrders(storicoOrdini);
      setFilteredOrders(storicoOrdini);
      historyLogger.info(`Caricati ${storicoOrdini.length} ordini con successo`);
    } catch (error: any) {
      historyLogger.error("Errore nel caricamento degli ordini:", error);
      setError(error.message);
      toast({
        variant: "destructive",
        title: "Errore nel caricamento degli ordini",
        description:
          error.message || "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold mb-6">Storico Ordini</h2>
        <div className="space-y-4">
          {[...Array(2)].map((_, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow-sm p-6 animate-pulse"
            >
              <div className="flex justify-between">
                <div>
                  <div className="h-5 bg-slate-200 rounded w-24 mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-32"></div>
                </div>
                <div className="h-6 bg-slate-200 rounded w-20"></div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-full"></div>
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Se c'è un errore, aggiungeremo solo un pulsante per riprovare, il toast è già mostrato
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold mb-6">Storico Ordini</h2>
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-slate-800">
            Impossibile caricare gli ordini
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Si è verificato un errore durante il caricamento degli ordini.
          </p>
          <div className="mt-6">
            <button
              onClick={fetchOrders}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              <svg
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Riprova
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 sm:py-6 md:py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 md:mb-6 gap-2 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold">Storico Ordini</h1>
        
        {/* Campo di ricerca per data */}
        {orders.length > 0 && (
          <div className="w-full sm:w-auto relative">
            <div className="relative">
              <Input
                type="text"
                placeholder="Cerca per data..."
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="pl-8 pr-3 py-1.5 h-9 text-sm w-full sm:w-52 md:w-64"
              />
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              
              {searchDate && (
                <button 
                  type="button"
                  onClick={() => setSearchDate("")}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-500"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M6 18L18 6M6 6l12 12" 
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {orders.length === 0 ? (
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
                  strokeWidth="1.5"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="mt-2 text-base sm:text-lg font-medium text-slate-800">
              Nessun ordine effettuato
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 mb-5 sm:mb-6">
              I tuoi ordini compariranno qui dopo la conferma
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
                Inizia a ordinare
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {searchDate && filteredOrders.length === 0 ? (
            // Stato di ricerca senza risultati
            <div className="bg-white rounded-lg shadow-sm p-6 text-center">
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
                    strokeWidth="1.5"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 className="mt-2 text-base sm:text-lg font-medium text-slate-800">
                Nessun risultato trovato
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 mb-5 sm:mb-6">
                Nessun ordine corrisponde alla data "{searchDate}".
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => setSearchDate("")}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-slate-900 text-white hover:bg-slate-800 h-10 py-2 px-4"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Mostra tutti gli ordini
                </button>
              </div>
            </div>
          ) : (
            // Lista degli ordini filtrati (caricamento progressivo - solo quelli visibili)
            filteredOrders.slice(0, visibleOrders).map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden history-card"
              >
                <div className="px-3 py-3 sm:py-4 sm:px-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base sm:text-lg leading-tight font-medium text-slate-800">
                        Ordine #{order.n_ordine || order.id}
                      </h3>
                      <p className="mt-1 text-xs sm:text-sm text-slate-500">
                        {format(new Date(order.data_ordine), "d MMMM yyyy", {
                          locale: it,
                        })}
                      </p>
                    </div>

                    <div className="flex flex-col items-end">
                      <div className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-green-600">
                        <Check className="w-3 h-3 mr-0.5" />
                        Inviato
                      </div>
                      
                      {order.righe && order.righe.length > 0 && (
                        <div className="text-xs text-slate-500 mt-1">
                          Totale {order.righe.reduce((total, riga) => total + (riga.quantità || 1), 0)} prodotti
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end mt-2">
                    <div className="flex items-center gap-2">
                      {/* Pulsante Riordina */}
                      <button
                        onClick={() => handleReorder(order)}
                        disabled={reorderingId === order.id}
                        title="Riordina"
                        aria-label="Riordina i prodotti di questo ordine"
                        className="flex items-center rounded px-2.5 py-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reorderingId === order.id ? (
                          <>
                            <svg className="animate-spin w-4 h-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </>
                        ) : (
                          <ShoppingCart className="w-4 h-4 mr-1.5" />
                        )}
                        Riordina
                      </button>
                      
                      {/* Pulsante PDF */}
                      <button
                        onClick={() => setCurrentOrder(order)}
                        title="Scarica PDF"
                        aria-label="Scarica PDF"
                        className="flex items-center rounded px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors pdf-button"
                      >
                        <FileDown className="w-4 h-4 mr-1.5" />
                        PDF
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200">
                  <dl>
                    <div className="bg-white px-3 py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-xs sm:text-sm font-medium text-slate-500 mb-1.5 sm:mb-0">
                        Prodotti
                      </dt>
                      <dd className="text-sm text-slate-900 sm:mt-0 sm:col-span-2">
                        <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-md">
                          <ul className="divide-y divide-slate-200 overflow-hidden">
                          {order.righe &&
                            order.righe.map((riga, index) => (
                              <li
                                key={index}
                                className="p-2.5 sm:p-3 flex items-start sm:items-center justify-between text-sm"
                              >
                                <div className="w-0 flex-1 flex items-start sm:items-center">
                                  {/* Immagine del prodotto */}
                                  <div className="h-9 w-9 mr-2.5 flex-shrink-0 bg-slate-100 rounded-md overflow-hidden">
                                    <img
                                      src={riga.immagine_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E"}
                                      alt={riga.nome_prodotto}
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = 
                                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
                                      }}
                                    />
                                  </div>
                                  <span className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between">
                                      <div className="font-medium text-slate-800 truncate mr-2 text-xs sm:text-sm flex items-center flex-wrap">
                                        <span>{riga.nome_prodotto}</span>
                                        {/* Utilizziamo il componente CodiceProdotto per coerenza in tutta l'app */}
                                        <div className="ml-1.5">
                                          <CodiceProdotto 
                                            prodottoId={riga.prodotto_id || 0} 
                                            configurazione={riga.configurazione || {}} 
                                            className="ml-0 text-[10px]"
                                            prefisso="Cod."
                                          />
                                        </div>
                                      </div>
                                      <div className="text-slate-500 font-medium whitespace-nowrap text-xs bg-slate-50 rounded-full px-1.5 py-0.5">
                                        × {riga.quantità}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-600 mt-1">
                                      {(() => {
                                        const configurazione = riga.configurazione || {};
                                        
                                        // Utilizziamo formatConfigurazione per avere coerenza con il resto dell'app
                                        // Passiamo il prodotto_id se disponibile per ordinare correttamente le proprietà
                                        const proprietàFormattate = formatConfigurazione(configurazione, riga.prodotto_id);
                                        
                                        // Render delle proprietà in ordine
                                        return proprietàFormattate.map((formattedProperty, i) => {
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
                                                  {chiave.charAt(0).toUpperCase() + 
                                                    (chiave.length > 8 ? chiave.slice(1, 6) + "." : chiave.slice(1))}:
                                                </span>
                                              </span>
                                              <span className="ml-0.5">{valore}</span>
                                            </div>
                                          );
                                        });
                                      })()}
                                    </div>
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ))
          )}
          
          {/* Pulsante "Carica altri" mostrato solo se ci sono più ordini da caricare */}
          {hasMore && (
            <div className="flex justify-center my-4 sm:my-6">
              <button 
                onClick={loadMoreOrders}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium transition-colors flex items-center"
              >
                <svg 
                  className="h-4 w-4 mr-2" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M19 9l-7 7-7-7" 
                  />
                </svg>
                Carica altri ordini
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Dialog per la selezione dei quadratini spuntabili */}
      <CheckablePdfDialog
        order={currentOrder}
        isOpen={!!currentOrder}
        onClose={() => setCurrentOrder(null)}
      />
      
      {/* Pulsante "Torna in alto" */}
      <ScrollToTop />
    </div>
  );
};

export default OrderHistory;





