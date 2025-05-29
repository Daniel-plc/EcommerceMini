import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase, addToCart, getCodiceProdotto, precaricaCodiciProdotto } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProdottoDinamico } from "@/lib/model";
import { formatConfigurazione, normalizzaValore, normalizzaValori, normalizzaCaratteristiche, setOrdineCaratteristiche } from "@/lib/utils";
import { getImmagineProdottoDinamicaOptimized as getImmagineProdottoDinamica, precaricaImmaginiProdotti } from "@/lib/image-cache";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { CodiceProdotto } from "@/components/ui/codice-prodotto";
import logger from "@/lib/logger";
import { useIsMobile } from "@/hooks/use-mobile";

// Logger specifico per il componente Products
const productsLogger = logger.createLogger('Products');

export default function Products() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Stati principali
  // ─────────────────────────────────────────────────────────────────────────────
  const [prodotti, setProdotti] = useState<ProdottoDinamico[]>([]);
  const [prodottiFiltrati, setProdottiFiltrati] = useState<ProdottoDinamico[]>([]);
  const [scelte, setScelte] = useState<Record<number, Record<string, string>>>({});
  const [quantita, setQuantita] = useState<Record<number, number>>({});
  // Aggiungiamo uno stato specifico per le quantità delle combinazioni di ricerca
  const [quantitaCombo, setQuantitaCombo] = useState<Record<string, number>>({});
  const [immagini, setImmagini] = useState<Record<number, string>>({});
  const [codiciProdotto, setCodiciProdotto] = useState<Record<number, string>>({});
  const [combinazioniValide, setCombinazioniValide] = useState<Record<number, any[]>>({});
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Gestione mobile e scroll position
  // ─────────────────────────────────────────────────────────────────────────────
  const isMobile = useIsMobile();
  const scrollPosRef = useRef(0);
  const [codiciProdottoTutti, setCodiciProdottoTutti] = useState<{
    codice: string;
    prodotto_id: number;
    configurazione: Record<string, string>;
    immagine_url: string;
  }[]>([]);
  // Stato per memorizzare i valori caratteristiche visibili - ottimizzazione "smart" 
  const [valoriLocali, setValoriLocali] = useState<{ id: number, visibile: boolean }[]>([]);
  
  // Cache per le opzioni disponibili - ottimizzazione prestazioni
  const opzioniCache = useRef<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [termineDiRicerca, setTermineDiRicerca] = useState("");
  const [searchNoResults, setSearchNoResults] = useState(false);
  const [risultatiCombinazioni, setRisultatiCombinazioni] = useState<{
    codice: string;
    prodotto_id: number;
    configurazione: Record<string, string>;
    immagine_url: string;
    prodotto: ProdottoDinamico | null;
  }[]>([]);

  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<ProdottoDinamico | null>(null);
  const { toast } = useToast();

  // Il pulsante "Torna in alto" è ora gestito dal componente ScrollToTop
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Ricerca live client-side per codice prodotto
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Funzione per resettare tutte le configurazioni dei prodotti
  const resetProdottiConfigurazioni = () => {
    // Reset delle scelte, immagini, codici e quantità combo per tutti i prodotti
    setScelte({});
    setImmagini({});
    setCodiciProdotto({});
    setQuantitaCombo({}); // Reset delle quantità delle combinazioni di ricerca
  };
  
  // useEffect per gestire la ricerca in tempo reale
  useEffect(() => {
    // Se il campo di ricerca è vuoto, mostra tutti i prodotti e resetta le configurazioni
    if (!termineDiRicerca.trim()) {
      setProdottiFiltrati(prodotti);
      setRisultatiCombinazioni([]);
      setSearchNoResults(false);
      // Resetta tutte le configurazioni quando si cancella la ricerca
      resetProdottiConfigurazioni();
      return;
    }
    
    // Filtra i prodotti in base al termine di ricerca
    const codiceDaCercare = termineDiRicerca.trim().toLowerCase();
    
    // Cerca nei codici prodotto - trova tutti quelli che iniziano con il termine di ricerca
    const risultatiCodice = codiciProdottoTutti.filter(item => 
      item.codice.toLowerCase().startsWith(codiceDaCercare)
    );
    
    if (risultatiCodice.length === 0) {
      // Nessun risultato trovato
      setProdottiFiltrati([]);
      setRisultatiCombinazioni([]);
      setSearchNoResults(true);
      resetProdottiConfigurazioni(); // Reset anche in caso di nessun risultato
      return;
    }
    
    // Utilizziamo un oggetto per tenere traccia delle quantità delle combinazioni
    // senza modificare lo stato globale scelte[]
    const nuoveQuantitaCombo: Record<string, number> = {};
    
    // Per ogni risultato, trova il prodotto corrispondente e crea l'elemento per la visualizzazione
    const risultatiCompleti = risultatiCodice.map(risultato => {
      const prodotto = prodotti.find(p => p.id === risultato.prodotto_id) || null;
      
      if (prodotto) {
        // Normalizza la configurazione per coerenza
        const configurazione = Object.fromEntries(
          Object.entries(risultato.configurazione || {}).map(([k, v]) => [
            k.toLowerCase().trim(),
            typeof v === 'string' ? v.toLowerCase().trim() : String(v).toLowerCase().trim()
          ])
        );
        
        // Utilizza la configurazione normalizzata
        
        // Genera una chiave univoca per questa combinazione
        const comboKey = `${prodotto.id}-${risultato.codice}`;
        
        // Inizializza la quantità per questa combinazione a 1 (o mantieni la quantità esistente)
        nuoveQuantitaCombo[comboKey] = quantitaCombo[comboKey] || 1;
        
        // Configurazione del prodotto pronta per l'uso
      }
      
      return {
        ...risultato,
        prodotto
      };
    }).filter(r => r.prodotto !== null); // Filtriamo eventuali riferimenti a prodotti non esistenti
    
    // Aggiorna lo stato delle quantità delle combinazioni
    setQuantitaCombo(nuoveQuantitaCombo);
    
    // Aggiorna le immagini per le configurazioni trovate
    for (const risultato of risultatiCompleti) {
      if (risultato.prodotto) {
        // Usiamo direttamente la configurazione del risultato invece di nuoveScelte
        updateImmagineProdotto(risultato.prodotto.id, risultato.configurazione || {});
      }
    }
    
    if (risultatiCompleti.length === 0) {
      setSearchNoResults(true);
      setRisultatiCombinazioni([]);
      resetProdottiConfigurazioni();
      return;
    }
    
    // Aggiorna il nuovo stato con tutti i risultati trovati (incluse combinazioni duplicate)
    setRisultatiCombinazioni(risultatiCompleti);
    
    // Per retrocompatibilità, aggiorniamo anche i prodotti filtrati con gli ID unici
    const prodottiIds = Array.from(new Set(risultatiCompleti.map(r => r.prodotto_id)));
    const prodottiFiltrati = prodotti.filter(p => prodottiIds.includes(p.id));
    setProdottiFiltrati(prodottiFiltrati);
    
    setSearchNoResults(false);
    
  }, [termineDiRicerca, prodotti, codiciProdottoTutti]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Caricamento dei prodotti e delle combinazioni dal database
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadProdotti = async () => {
      try {
        setLoading(true);
        
        // Inizia il caricamento dei dati

        // 1) Fetch dei prodotti con le loro caratteristiche/valori
        const { data: prodottiData, error: prodError } = await supabase.from(
          "prodotti",
        ).select(`
            id,
            nome,
            descrizione,
            immagine_url,
            max_righe_card,
            prodotti_caratteristiche (
              id, caratteristica_id, visibile, obbligatoria, ordine,
              caratteristiche ( id, nome, nome_label )
            ),
            prodotti_valori_caratteristiche (
              id, valore_id, visibile,
              valori_caratteristiche ( id, caratteristica_id, valore,  descrizione, ordine )
            )
          `);

        if (prodError) {
          productsLogger.error("Errore fetch prodotti:", prodError);
          setError("Errore nel caricamento dei prodotti.");
          return;
        }
        
        // Estrai tutti gli ID prodotto per precaricare i codici prodotto in anticipo
        const idsPerCodiceProdotto = prodottiData?.map(p => p.id) || [];
        if (idsPerCodiceProdotto.length > 0) {
          // Precarica i codici prodotto in parallelo con il recupero delle immagini
          precaricaCodiciProdotto(idsPerCodiceProdotto).catch(err => 
            productsLogger.error("Errore nel precaricamento dei codici prodotto:", err)
          );
        }

        // 2) Fetch delle combinazioni da "immagini_prodotti_dinamiche"
        const { data: immaginiData, error: imgError } = await supabase
          .from("immagini_prodotti_dinamiche")
          .select("prodotto_id, configurazione, immagine_url, codice_prodotto");

        if (imgError) {
          productsLogger.error("Errore fetch immagini dinamiche:", imgError);
          setError("Errore nel caricamento delle immagini dinamiche.");
          return;
        }

        // 3) Normalizza le combinazioni e le raggruppa per prodotto
        const combinazioniPerProdotto: Record<number, any[]> = {};
        // Array per tutti i codici prodotto (per la ricerca client-side)
        const tuttiCodiciProdotto: {
          codice: string;
          prodotto_id: number;
          configurazione: Record<string, string>;
          immagine_url: string;
        }[] = [];
        
        if (immaginiData) {
          immaginiData.forEach((img) => {
            if (!combinazioniPerProdotto[img.prodotto_id]) {
              combinazioniPerProdotto[img.prodotto_id] = [];
            }
            const configNorm = Object.fromEntries(
              Object.entries(img.configurazione || {}).map(([k, v]) => [
                normalizzaValore(k),
                normalizzaValore(String(v)),
              ]),
            );
            
            combinazioniPerProdotto[img.prodotto_id].push({
              configurazione: configNorm,
              immagine_url: img.immagine_url,
              codice_prodotto: img.codice_prodotto
            });
            
            // Aggiungi alla lista completa dei codici per la ricerca
            if (img.codice_prodotto) {
              tuttiCodiciProdotto.push({
                codice: img.codice_prodotto,
                prodotto_id: img.prodotto_id,
                configurazione: configNorm,
                immagine_url: img.immagine_url
              });
            }
          });
        }
        
        // Salva sia le combinazioni valide che l'array di tutti i codici prodotto
        setCombinazioniValide(combinazioniPerProdotto);
        setCodiciProdottoTutti(tuttiCodiciProdotto);

        // 4) Mappa i prodotti e prepara le caratteristiche e i valori
        const prodottiFormattati = (prodottiData || []).map((p) => {
          // Normalizza le caratteristiche per ogni prodotto
          const caratteristicheNormalizzate = normalizzaCaratteristiche(p);
          
          // Carica l'ordine delle caratteristiche nella cache per l'ordinamento dinamico
          setOrdineCaratteristiche(p.id, caratteristicheNormalizzate);
          
          return {
            ...p,
            caratteristiche: caratteristicheNormalizzate,
            valori_caratteristiche: normalizzaValori(p),
          };
        });
        
        // 4.1) Popola l'array valoriLocali con tutti i valori caratteristiche visibili
        const valoriVisibili: { id: number, visibile: boolean }[] = [];
        prodottiData?.forEach(p => {
          (p.prodotti_valori_caratteristiche || []).forEach(pvc => {
            if (pvc.valori_caratteristiche && typeof pvc.valori_caratteristiche === 'object') {
              const valoreCaratteristica = pvc.valori_caratteristiche as any;
              if (valoreCaratteristica.id) {
                valoriVisibili.push({
                  id: valoreCaratteristica.id,
                  visibile: pvc.visibile !== false
                });
              }
            }
          });
        });
        setValoriLocali(valoriVisibili);

        // Mostriamo i prodotti subito per migliorare la percezione di velocità
        setProdotti(prodottiFormattati);
        setProdottiFiltrati(prodottiFormattati);
        
        // 5) Inizializza scelte e quantità immediatamente
        const scelteIniziali: Record<number, Record<string, string>> = {};
        const quantitaIniziali: Record<number, number> = {};

        for (const p of prodottiFormattati) {
          scelteIniziali[p.id] = {};
          quantitaIniziali[p.id] = 1;
        }
        setScelte(scelteIniziali);
        setQuantita(quantitaIniziali);

        // Rendi visibili i prodotti e togli il loading spinner principale
        setLoading(false);
        
        // 6) OTTIMIZZAZIONE AVANZATA: Precarichiamo tutte le immagini in parallelo
        // e le memorizziamo nella cache del browser
        const idsPerImmagini = prodottiFormattati.map(p => p.id);
        await precaricaImmaginiProdotti(idsPerImmagini);
        
        // 7) Una volta che le immagini sono precaricate, impostiamo le immagini default
        // per ogni prodotto (adesso saranno già nella cache del browser)
        const immaginiIniziali: Record<number, string> = {};
        for (const p of prodottiFormattati) {
          const url = await getImmagineProdottoDinamica(p.id, {});
          if (url) {
            immaginiIniziali[p.id] = url;
          }
        }
        
        // Aggiorna tutte le immagini in un'unica operazione per evitare tanti re-render
        setImmagini(immaginiIniziali);
        
      } catch (err) {
        productsLogger.error("Errore generico nel caricamento:", err);
        setError("Errore nel caricamento dei prodotti.");
        setLoading(false);
      }
    };
    loadProdotti();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Il codice è stato semplificato, ora verifichiamo direttamente il numero di opzioni
  // disponibili per ogni menu direttamente in isCaratteristicaSelezionabile
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Verifica se una caratteristica è selezionabile 
  // VERSIONE DEFINITIVA - Regola semplice e universale
  // ─────────────────────────────────────────────────────────────────────────────
  const isCaratteristicaSelezionabile = (
    prodottoId: number,
    caratteristicaKey: string
  ) => {
    const prodotto = prodotti.find(p => p.id === prodottoId);
    if (!prodotto) return false;

    const scelteAttuali = scelte[prodottoId] || {};
    const caratteristiche = [...prodotto.caratteristiche]
      .sort((a, b) => a.ordine - b.ordine);

    const idxCorr = caratteristiche.findIndex(
      c => c.chiave_configurazione.toLowerCase() === caratteristicaKey.toLowerCase()
    );
    if (idxCorr < 0) return false;
    if (idxCorr === 0) return true;                 // la prima è sempre attiva

    // ---------------------------------------------
    // per OGNI menu precedente:
    //   – se ora ha opzioni   ⇒ DEVE essere scelto
    //   – se ha 0 opzioni     ⇒ lo ignoriamo
    // ---------------------------------------------
    for (let i = 0; i < idxCorr; i++) {
      const prec = caratteristiche[i];
      const keyPrec = prec.chiave_configurazione.toLowerCase();

      // quante opzioni ha con le scelte correnti?
      const opzioniPrec = getValoriDisponibili(prodottoId, keyPrec);
      if (opzioniPrec.length === 0) {
        // Menu con zero opzioni - si salta
        continue;
      }

      const valore = scelteAttuali[keyPrec]?.trim();
      if (!valore) {
        // Menu precedente non selezionato
        return false;
      }
    }

    // Tutte le caratteristiche precedenti sono selezionate o non hanno opzioni
    return true;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Nome della caratteristica mancante (se non è selezionabile)
  // VERSIONE DEFINITIVA - Regola semplice e universale
  // ─────────────────────────────────────────────────────────────────────────────
  const getCaratteristicaPrecedente = (
    prodottoId: number,
    caratteristicaKey: string,
  ) => {
    const prodotto = prodotti.find((p) => p.id === prodottoId);
    if (!prodotto) return "tipologia"; // Fallback sicuro

    const caratteristiche = [...prodotto.caratteristiche].sort(
      (a, b) => a.ordine - b.ordine,
    );
    const keyLower = caratteristicaKey.toLowerCase();
    const scelteAttuali = scelte[prodottoId] || {};
    
    // Trova la posizione del menu corrente
    const idxCorr = caratteristiche.findIndex(
      c => c.chiave_configurazione.toLowerCase() === keyLower
    );
    if (idxCorr <= 0) return ""; // Primo menu o menu non trovato
    
    // ---------------------------------------------
    // per OGNI menu precedente:
    //   – se ora ha opzioni   ⇒ DEVE essere scelto
    //   – se ha 0 opzioni     ⇒ lo ignoriamo
    // ---------------------------------------------
    for (let i = 0; i < idxCorr; i++) {
      const prec = caratteristiche[i];
      const keyPrec = prec.chiave_configurazione.toLowerCase();
      
      // quante opzioni ha con le scelte correnti?
      const opzioniPrec = getValoriDisponibili(prodottoId, keyPrec);
      if (opzioniPrec.length === 0) continue; // niente opzioni → si salta
      
      const valore = scelteAttuali[keyPrec]?.trim();
      if (!valore) {
        // Trovato il menu che blocca: ha opzioni ma non è stato scelto
        return prec.nome || "opzione precedente";
      }
    }
    
    // Se non c'è nessun menu bloccante, non serve messaggio
    return "";
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Gestisce il cambio di selezione per una caratteristica
  // ─────────────────────────────────────────────────────────────────────────────
  const handleChange = async (
    prodottoId: number,
    chiaveConfigurazione: string,
    valore: string
  ) => {
    // Trova il prodotto
    const prodotto = prodotti.find((p) => p.id === prodottoId);
    if (!prodotto) return;

    // ----- GESTIONE SPECIFICA MOBILE PER MANTENERE LA POSIZIONE DI SCROLL -----
    // Solo su dispositivi mobili, dove il problema si verifica
    if (isMobile) {
      // Salviamo la posizione di scroll prima di qualsiasi modifica
      scrollPosRef.current = window.scrollY;
    }

    // 1) Normalizza chiave e valore
    const chiaveNorm = chiaveConfigurazione.toLowerCase().trim();
    const valoreNorm = normalizzaValore(valore);

    // 2) Aggiorna con la nuova scelta (se vuoto, rimuovi la chiave)
    const nuoveScelte = { ...scelte[prodottoId] };
    if (!valore) {
      delete nuoveScelte[chiaveNorm];
    } else {
      nuoveScelte[chiaveNorm] = valoreNorm;
    }

    // 3) Rimuovi tutte le scelte delle caratteristiche successive
    const caratteristiche = [...prodotto.caratteristiche].sort(
      (a, b) => a.ordine - b.ordine,
    );
    const indiceAttuale = caratteristiche.findIndex(
      (c) => c.chiave_configurazione.toLowerCase() === chiaveNorm,
    );
    if (indiceAttuale === -1) return;

    // Crea una copia pulita per evitare modifiche indesiderate
    const successiveScelte = { ...nuoveScelte };
    
    // Importante: rimuovi esplicitamente TUTTE le chiavi successive
    // questo assicura che i menu a tendina successivi si resettino
    caratteristiche.slice(indiceAttuale + 1).forEach((c) => {
      delete successiveScelte[c.chiave_configurazione.toLowerCase()];
    });

    // 4) Aggiorna lo stato con le scelte finali
    setScelte((prev) => ({
      ...prev,
      [prodottoId]: successiveScelte,
    }));

    // 5) Aggiorna l'immagine dinamica e il codice prodotto
    try {
      // Usa la versione ottimizzata che utilizza immagini precaricate
      const url = await getImmagineProdottoDinamica(
        prodottoId, 
        successiveScelte
      );

      // Se non c'è immagine per configurazione incompleta, resetta a immagine default
      if (url) {
        // Aggiorna l'immagine (dovrebbe essere già nella cache del browser)
        setImmagini((prev) => ({ ...prev, [prodottoId]: url }));
        
        // Recupera il codice prodotto utilizzando la funzione con cache globale
        try {
          const codice = await getCodiceProdotto(prodottoId, successiveScelte);
          
          // Aggiorna il codice prodotto se trovato, altrimenti resetta
          if (codice) {
            setCodiciProdotto((prev) => ({ ...prev, [prodottoId]: codice }));
          } else {
            setCodiciProdotto((prev) => {
              const nextState = { ...prev };
              delete nextState[prodottoId];
              return nextState;
            });
          }
        } catch (err) {
          productsLogger.error("Errore recupero codice prodotto:", err);
          // In caso di errore, fallback al metodo precedente
          const configCorrente = successiveScelte;
          const combo = combinazioniValide[prodottoId]?.find((c) => {
            // Confronta ogni elemento della configurazione
            return Object.entries(configCorrente).every(([chiave, valore]) => {
              return c.configurazione[chiave] === valore;
            });
          });
          
          if (combo?.codice_prodotto) {
            setCodiciProdotto((prev) => ({ ...prev, [prodottoId]: combo.codice_prodotto }));
          }
        }
      } else {
        const prodottoDefault = prodotti.find((p) => p.id === prodottoId);
        if (prodottoDefault?.immagine_url) {
          setImmagini((prev) => ({
            ...prev,
            [prodottoId]: prodottoDefault.immagine_url,
          }));
          
          // Resetta il codice prodotto quando non c'è immagine specifica
          setCodiciProdotto((prev) => {
            const nextState = { ...prev };
            delete nextState[prodottoId];
            return nextState;
          });
        }
      }
      
      // Ripristina la posizione di scroll solo su dispositivi mobili
      if (isMobile) {
        // Usiamo requestAnimationFrame per assicurarci che il ripristino
        // avvenga DOPO che React ha completato il rendering
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollPosRef.current);
        });
      }
    } catch (err) {
      productsLogger.error("Errore aggiornamento immagine:", err);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Aggiorna l'immagine del prodotto e codice in base alla configurazione
  // ─────────────────────────────────────────────────────────────────────────────
  const updateImmagineProdotto = async (prodottoId: number, configurazione: Record<string, string>) => {
    // Per dispositivi mobili, salva la posizione di scroll prima dell'aggiornamento
    if (isMobile) {
      scrollPosRef.current = window.scrollY;
    }
    
    try {
      // Usa la versione ottimizzata che utilizza immagini precaricate
      const url = await getImmagineProdottoDinamica(prodottoId, configurazione);

      // Se non c'è immagine per configurazione incompleta, usa immagine default
      if (url) {
        // Aggiorna l'immagine
        setImmagini((prev) => ({ ...prev, [prodottoId]: url }));
        
        // Recupera il codice prodotto utilizzando la funzione con cache globale
        try {
          const codice = await getCodiceProdotto(prodottoId, configurazione);
          
          // Aggiorna il codice prodotto se trovato, altrimenti resetta
          if (codice) {
            setCodiciProdotto((prev) => ({ ...prev, [prodottoId]: codice }));
          } else {
            setCodiciProdotto((prev) => {
              const nextState = { ...prev };
              delete nextState[prodottoId];
              return nextState;
            });
          }
        } catch (err) {
          productsLogger.error("Errore recupero codice prodotto:", err);
          // In caso di errore, fallback al metodo precedente
          const combo = combinazioniValide[prodottoId]?.find((c) => {
            return Object.entries(configurazione).every(([chiave, valore]) => {
              return c.configurazione[chiave] === valore;
            });
          });
          
          if (combo?.codice_prodotto) {
            setCodiciProdotto((prev) => ({ ...prev, [prodottoId]: combo.codice_prodotto }));
          }
        }
      } else {
        const prodottoDefault = prodotti.find((p) => p.id === prodottoId);
        if (prodottoDefault?.immagine_url) {
          setImmagini((prev) => ({
            ...prev,
            [prodottoId]: prodottoDefault.immagine_url,
          }));
          
          // Resetta il codice prodotto quando non c'è immagine specifica
          setCodiciProdotto((prev) => {
            const nextState = { ...prev };
            delete nextState[prodottoId];
            return nextState;
          });
        }
      }
      
      // Ripristina la posizione di scroll su dispositivi mobili
      if (isMobile) {
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollPosRef.current);
        });
      }
    } catch (err) {
      productsLogger.error("Errore aggiornamento immagine:", err);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Verifica se tutte le caratteristiche richieste hanno valore
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Verifica se una caratteristica è dinamicamente obbligatoria 
   * (non marcata come obbligatoria ma richiesta dalla configurazione attuale)
   */
  const isDinamicallyRequired = (prodottoId: number, caratteristicaKey: string) => {
    const prodotto = prodotti.find(p => p.id === prodottoId);
    if (!prodotto) return false;
    
    // Se la caratteristica è già marcata come obbligatoria, ritorna false
    // (è già gestita dal sistema normale)
    const caratteristica = prodotto.caratteristiche.find(
      c => c.chiave_configurazione.toLowerCase() === caratteristicaKey.toLowerCase()
    );
    if (caratteristica?.obbligatoria) return false;
    
    // Recupera le selezioni correnti
    const selezioniAttuali = scelte[prodottoId] || {};
    if (Object.keys(selezioniAttuali).length === 0) return false;
    
    // Recupera i valori della caratteristica disponibili con le selezioni attuali
    const valoriDisponibili = getValoriDisponibili(prodottoId, caratteristicaKey);
    
    // Se non ci sono valori disponibili, non può essere richiesta
    if (valoriDisponibili.length === 0) return false;
    
    // Controlla se è selezionabile (dipende dalle caratteristiche precedenti)
    const isSelezionabile = isCaratteristicaSelezionabile(prodottoId, caratteristicaKey);
    if (!isSelezionabile) return false;
    
    // Nel caso della confezione che dovrebbe mostrare l'asterisco
    // quando la caratteristica è selezionabile ma non ha ancora un valore
    // e ci sono opzioni disponibili (1 opz.)
    return true;
  };

  const checkTutteObbligatorieSelezionate = (prodottoId: number) => {
    const prodotto = prodotti.find((p) => p.id === prodottoId);
    if (!prodotto) return false;

    const scelteDelProdotto = scelte[prodottoId] || {};
    
    // 1. Verifica se tutte le caratteristiche obbligatorie hanno un valore
    const obbligatorie = prodotto.caratteristiche.filter(c => c.obbligatoria);
    const tutteObbligatorieListed = obbligatorie.every(c => {
      const chiave = c.chiave_configurazione.toLowerCase();
      const valore = scelteDelProdotto[chiave];
      return valore && valore.trim() !== "";
    });
    
    if (!tutteObbligatorieListed) {
      return false;
    }
    
    // 2. Verifica se ci sono caratteristiche non obbligatorie MA con valori disponibili
    // che dovrebbero essere selezionate
    for (const caratteristica of prodotto.caratteristiche) {
      // Salta le obbligatorie, già verificate sopra
      if (caratteristica.obbligatoria) continue;
      
      const chiave = caratteristica.chiave_configurazione.toLowerCase();
      const valore = scelteDelProdotto[chiave];
      
      // Verifica se questa caratteristica è selezionabile (se le precedenti sono state compilate)
      if (!isCaratteristicaSelezionabile(prodottoId, chiave)) {
        continue;
      }
      
      // Ottieni i valori disponibili per questa caratteristica
      const valoriDisponibili = getValoriDisponibili(prodottoId, chiave);
      
      // Se non ci sono valori disponibili, salta questa caratteristica
      if (valoriDisponibili.length === 0) {
        continue;
      }
      
      // Se questa caratteristica è selezionabile (le precedenti sono selezionate)
      // e ha valori disponibili ma non è stato selezionato nulla
      if (valoriDisponibili.length > 0 && (!valore || valore.trim() === "")) {
        // Verifica se può essere saltata confrontando con le combinazioni valide
        
        // Filtra le possibili combinazioni valide con le selezioni attuali
        const possibiliCombinazioni = combinazioniValide[prodottoId]?.filter(combo => {
          // Tutti i campi già selezionati devono corrispondere
          return Object.entries(scelteDelProdotto).every(([k, v]) => {
            if (!v || v.trim() === "") return true; // Salta campi vuoti
            return combo.configurazione[k] === v;
          });
        }) || [];
        
        // Se esistono combinazioni valide che non hanno un valore per questa caratteristica
        // allora è possibile saltarla
        const puoEssereSaltata = possibiliCombinazioni.some(combo => {
          const valoreInCombo = combo.configurazione[chiave];
          return !valoreInCombo || valoreInCombo.trim() === "";
        });
        
        // Se non può essere saltata, allora è richiesta
        if (!puoEssereSaltata) {
          return false;
        }
      }
    }
    
    // 3. Verifica se la configurazione attuale è valida per almeno una combinazione esistente
    if (combinazioniValide[prodottoId] && combinazioniValide[prodottoId].length > 0 && Object.keys(scelteDelProdotto).length > 0) {
      // Cerca se esiste almeno una combinazione che corrisponde ESATTAMENTE 
      // alle selezioni attuali (inclusi i campi vuoti)
      const esisteCombinazioneEsatta = combinazioniValide[prodottoId].some(combo => {
        // Per ogni caratteristica del prodotto
        for (const caratteristica of prodotto.caratteristiche) {
          const chiave = caratteristica.chiave_configurazione.toLowerCase();
          const valore = scelteDelProdotto[chiave];
          
          // Se c'è un valore selezionato, deve corrispondere esattamente
          if (valore && valore.trim() !== "") {
            if (combo.configurazione[chiave] !== valore) {
              return false;
            }
          }
          // Se non c'è un valore selezionato ma la combinazione ne ha uno
          else if (combo.configurazione[chiave] && combo.configurazione[chiave].trim() !== "") {
            return false;
          }
        }
        return true;
      });
      
      // Se non esiste una combinazione esatta, la configurazione non è valida
      if (!esisteCombinazioneEsatta) {
        return tutteObbligatorieListed; // Permetti solo se almeno tutte le obbligatorie sono selezionate
      }
    }
    
    // Se tutte le verifiche passano
    return true;
  };
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Verifica se una configurazione di ricerca è valida e completa
  // ─────────────────────────────────────────────────────────────────────────────
  const checkConfigurazioneValidaRicerca = (prodottoId: number, configurazione: Record<string, string>) => {
    const prodotto = prodotti.find((p) => p.id === prodottoId);
    if (!prodotto) return false;
    
    // Se il prodotto non ha caratteristiche, la configurazione è sempre valida
    if (prodotto.caratteristiche.length === 0) return true;
    
    // Conta il numero di chiavi in configurazione
    const numChiaviConfigurazione = Object.keys(configurazione).length;
    
    // Per la modalità ricerca, una configurazione è valida se ha almeno una proprietà
    // e tutti i valori specificati non sono vuoti
    if (numChiaviConfigurazione > 0) {
      // Verifica che nessun valore presente sia vuoto
      const tuttiValoriNonVuoti = Object.values(configurazione).every(val => 
        val === undefined || val === null || val === "" || (val && val.trim() !== "")
      );
      
      // Se è un codice prodotto preconfigurato, dovrebbe essere sempre valido
      return tuttiValoriNonVuoti;
    }
    
    // Se non ha configurazioni, non è valido
    return false;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Ottiene i valori disponibili per una caratteristica 
  //           (filtrando per visibilità)
  // ─────────────────────────────────────────────────────────────────────────────
  const getValoriDisponibili = (
    prodottoId: number,
    caratteristicaKey: string,
  ) => {
    // Creo una chiave di cache che include prodotto, caratteristica e selezioni correnti
    const cacheKey = `${prodottoId}-${caratteristicaKey}-${JSON.stringify(scelte[prodottoId] || {})}`;
    
    // Se abbiamo già calcolato questi valori, li restituiamo dalla cache
    if (opzioniCache.current[cacheKey]) {
      return opzioniCache.current[cacheKey];
    }
    
    const prodotto = prodotti.find((p) => p.id === prodottoId);
    if (!prodotto) return [];

    // Deve essere selezionabile, altrimenti restituisce lista vuota
    if (!isCaratteristicaSelezionabile(prodottoId, caratteristicaKey)) {
      return [];
    }

    // Trova la caratteristica
    const caratteristica = prodotto.caratteristiche.find(
      (c) => c.chiave_configurazione.toLowerCase() === caratteristicaKey.toLowerCase(),
    );
    if (!caratteristica) return [];

    // Estrai la caratteristica_id originale e l'ID ORM della caratteristica
    const caratteristicaId = caratteristica.caratteristica_id;

    // Ottieni i valori delle caratteristiche precedenti
    const caratteristiche = [...prodotto.caratteristiche].sort(
      (a, b) => a.ordine - b.ordine,
    );
    const indiceAttuale = caratteristiche.findIndex(
      (c) => c.chiave_configurazione.toLowerCase() === caratteristicaKey.toLowerCase(),
    );
    if (indiceAttuale === -1) return [];

    const precedenti = caratteristiche.slice(0, indiceAttuale);
    const scelteAttuali = scelte[prodottoId] || {};
    
    // Ottieni le selezioni correnti delle caratteristiche precedenti
    const valoriPrecedenti: Record<string, string> = {};
    precedenti.forEach((c) => {
      valoriPrecedenti[c.chiave_configurazione] = scelteAttuali[c.chiave_configurazione];
    });

    // Filtra i valori validi in base alle selezioni precedenti e alle combinazioni valide
    let valoriDisponibili = prodotto.valori_caratteristiche
      .filter((v) => v.caratteristica_id === caratteristicaId)
      .sort((a, b) => a.ordine - b.ordine);

    // Se non è la prima caratteristica,
    // dobbiamo filtrare ulteriormente in base alle selezioni precedenti
    if (indiceAttuale > 0 && combinazioniValide[prodottoId]) {
      // Per ogni valore della caratteristica corrente, verifica se esiste almeno una 
      // combinazione valida con le selezioni precedenti
      valoriDisponibili = valoriDisponibili.filter((val) => {
        const valoreNorm = normalizzaValore(val.valore || "");
        
        // Almeno una combinazione deve soddisfare:
        // 1. Tutte le selezioni precedenti
        // 2. Il valore corrente che stiamo testando
        return combinazioniValide[prodottoId].some((combo) => {
          // Verifica che tutte le selezioni precedenti corrispondano
          const precedentiMatch = Object.entries(valoriPrecedenti).every(
            ([chiave, valore]) => {
              // Ignora i valori non selezionati (vuoti)
              if (!valore || valore.trim() === "") return true;
              return combo.configurazione[chiave] === valore;
            },
          );
          
          // Verifica anche il valore corrente
          const valoreMatch = combo.configurazione[caratteristicaKey] === valoreNorm;
          
          return precedentiMatch && valoreMatch;
        });
      });
    }

    // Memorizza il risultato nella cache per future chiamate
    return (opzioniCache.current[cacheKey] = valoriDisponibili);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Aggiorna la quantità selezionata
  // ─────────────────────────────────────────────────────────────────────────────
  const updateQuantity = (prodottoId: number, delta: number) => {
    setQuantita((prev) => {
      const currQty = prev[prodottoId] || 1;
      // Se il delta è negativo, assicuriamoci di non scendere sotto 1
      if (delta < 0 && currQty <= 1) {
        return prev; // Non modifica nulla se già a 1
      }
      const newQty = Math.max(1, currQty + delta);
      // Limita a 9999 come massimo
      const limitedQty = Math.min(9999, newQty);
      return { ...prev, [prodottoId]: limitedQty };
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Aggiorna la quantità di una combinazione specifica (per i risultati di ricerca)
  // ─────────────────────────────────────────────────────────────────────────────
  const updateComboQuantity = (comboKey: string, delta: number) => {
    setQuantitaCombo((prev) => {
      const currQty = prev[comboKey] || 1;
      // Se il delta è negativo, assicuriamoci di non scendere sotto 1
      if (delta < 0 && currQty <= 1) {
        return prev; // Non modifica nulla se già a 1
      }
      const newQty = Math.max(1, currQty + delta);
      // Limita a 9999 come massimo
      const limitedQty = Math.min(9999, newQty);
      return { ...prev, [comboKey]: limitedQty };
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Gestisce l'aggiunta al carrello
  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Verifica se un valore caratteristica è visibile attraverso la validazione "smart"
  // ─────────────────────────────────────────────────────────────────────────────
  // Cache per i valori verificati per evitare richieste ripetute
  const valoriVerificatiCache = useRef<Record<number, boolean>>({});
  
  const verificaValoreVisibile = async (valoreId: number): Promise<boolean> => {
    // Verifica se è già in cache
    if (valoriVerificatiCache.current[valoreId] !== undefined) {
      return valoriVerificatiCache.current[valoreId];
    }
    
    // 1. Prima verifica se il valore esiste nei dati locali (evita chiamata al server)
    const valoreLocale = valoriLocali.find(v => v.id === valoreId);
    if (valoreLocale) {
      // Aggiungi alla cache e non loggare per ogni chiamata
      valoriVerificatiCache.current[valoreId] = valoreLocale.visibile;
      return valoreLocale.visibile;
    }
    
    // 2. Se non trovato localmente, effettua una singola query leggera per verificare
    // Nota: non logghiamo più ogni singola query per ridurre il rumore nella console
    try {
      const { data, error } = await supabase
        .from("prodotti_valori_caratteristiche")
        .select("visibile")
        .eq("valori_caratteristiche.id", valoreId)
        .single();

      const risultato = !error && data?.visibile === true;
      
      // Aggiungi alla cache
      valoriVerificatiCache.current[valoreId] = risultato;
      
      return risultato;
    } catch (error) {
      productsLogger.error(`Errore nella verifica visibilità del valore ID ${valoreId}:`, error);
      // Anche in caso di errore, mettiamo in cache per evitare richieste ripetute
      valoriVerificatiCache.current[valoreId] = false;
      return false;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  const handleAggiungi = async (prodottoId: number) => {
    const prodotto = prodotti.find((p) => p.id === prodottoId);
    if (!prodotto) return;

    // Verifica se tutte le caratteristiche richieste hanno valore
    if (!checkTutteObbligatorieSelezionate(prodottoId)) {
      // Trova quali campi mancano per dare un messaggio più specifico
      const scelteDelProdotto = scelte[prodottoId] || {};
      let messaggioErrore = "Selezione incompleta. ";
      
      // Controlla prima le obbligatorie
      for (const caratteristica of prodotto.caratteristiche) {
        const chiave = caratteristica.chiave_configurazione.toLowerCase();
        const valore = scelteDelProdotto[chiave];
        
        // Se è obbligatoria e manca
        if (caratteristica.obbligatoria && (!valore || valore.trim() === "")) {
          messaggioErrore += `Seleziona "${caratteristica.nome}". `;
          break;
        }
        
        // Se non è obbligatoria ma ha valori disponibili
        if (!caratteristica.obbligatoria && isCaratteristicaSelezionabile(prodottoId, chiave)) {
          const valoriDisponibili = getValoriDisponibili(prodottoId, chiave);
          
          // Se ha valori disponibili e non è selezionata
          if (valoriDisponibili.length > 0 && (!valore || valore.trim() === "")) {
            // Verifica se è una caratteristica necessaria
            const possibiliCombinazioni = combinazioniValide[prodottoId]?.filter(combo => {
              return Object.entries(scelteDelProdotto).every(([k, v]) => {
                if (k === chiave) return true; // Ignora la caratteristica corrente
                if (!v || v.trim() === "") return true; // Ignora campi vuoti
                return combo.configurazione[k] === v;
              });
            }) || [];
            
            // Se esistono combinazioni ma tutte richiedono un valore
            if (possibiliCombinazioni.length > 0) {
              const tutteRichiedonoValore = possibiliCombinazioni.every(combo => {
                return combo.configurazione[chiave] && combo.configurazione[chiave].trim() !== "";
              });
              
              if (tutteRichiedonoValore) {
                messaggioErrore += `Seleziona "${caratteristica.nome}". `;
                break;
              }
            }
          }
        }
      }
      
      toast({
        title: "Selezione incompleta",
        description: messaggioErrore,
        variant: "destructive",
      });
      return;
    }

    try {
      // 1. Ottieni la configurazione corrente
      const configurazioneAttuale = scelte[prodottoId] || {};
      
      // 2. Ottieni l'immagine corrente
      const immagineUrl = immagini[prodottoId] || prodotto.immagine_url;
      
      // 3. Validazione "smart" prima di aggiungere al carrello
      // Trova l'ID del valore selezionato nelle caratteristiche del prodotto
      const valoreIds: number[] = [];
      
      // Estrai gli ID dei valori dalla configurazione attuale
      for (const [chiave, valore] of Object.entries(configurazioneAttuale)) {
        const caratteristica = prodotto.caratteristiche.find(c => 
          c.chiave_configurazione.toLowerCase() === chiave.toLowerCase()
        );
        
        if (caratteristica) {
          const valoreCaratteristica = prodotto.valori_caratteristiche.find(v => 
            v.caratteristica_id === caratteristica.caratteristica_id && 
            normalizzaValore(v.valore) === normalizzaValore(valore)
          );
          
          if (valoreCaratteristica) {
            valoreIds.push(valoreCaratteristica.id);
          }
        }
      }
      
      // Verifica visibilità di tutti i valori selezionati
      for (const valoreId of valoreIds) {
        const valoreVisibile = await verificaValoreVisibile(valoreId);
        if (!valoreVisibile) {
          toast({
            title: "Configurazione non disponibile",
            description: "Questa configurazione non è più disponibile. Prova con un'altra combinazione.",
            variant: "destructive",
          });
          return;
        }
      }
      
      // 4. Ordine predefinito delle chiavi per consistenza
      const ordineChiavi = ["tipologia", "formato", "confezione"];
      
      // Ordina le chiavi della configurazione secondo l'ordine stabilito
      const configurazioneOrdinata: Record<string, string> = {};
      
      // Prima inserisci le chiavi nell'ordine specificato
      ordineChiavi.forEach(chiave => {
        // Cerca la chiave nel configurazione (case insensitive)
        const trovata = Object.keys(configurazioneAttuale).find(k => 
          k.toLowerCase() === chiave.toLowerCase()
        );
        
        if (trovata && configurazioneAttuale[trovata]) {
          configurazioneOrdinata[trovata] = configurazioneAttuale[trovata];
        }
      });
      
      // Poi aggiungi eventuali altre chiavi che non sono nell'ordine predefinito
      Object.keys(configurazioneAttuale).forEach(chiave => {
        if (!ordineChiavi.includes(chiave.toLowerCase()) && configurazioneAttuale[chiave]) {
          configurazioneOrdinata[chiave] = configurazioneAttuale[chiave];
        }
      });
      
      // 5. Aggiungi al carrello con la configurazione ordinata
      // Chiamiamo la funzione senza await per evitare il warning TypeScript
      addToCart({
        product: {
          id: prodotto.id,
          nome: prodotto.nome,
          descrizione: prodotto.descrizione,
          immagine_url: prodotto.immagine_url,
        },
        configurazione: configurazioneOrdinata,
        immagine_url: immagineUrl,
        quantity: quantita[prodottoId] || 1,
      });

      // 6. Feedback utente positivo (con nome prodotto, codice e sommario configurazione)
      const descrizioneConfig = formatConfigurazione(configurazioneOrdinata, prodottoId).join(", ");
      
      // Recupera il codice prodotto in background e poi aggiorna il toast
      toast({
        title: "Prodotto aggiunto",
        description: (
          <div className="flex flex-col space-y-1">
            <div>{`${prodotto.nome} ${descrizioneConfig ? `(${descrizioneConfig})` : ""} aggiunto all'ordine.`}</div>
            <div className="flex items-center mt-1">
              <CodiceProdotto 
                prodottoId={prodottoId} 
                configurazione={configurazioneOrdinata}
                className="ml-0 mt-0.5"
              />
            </div>
          </div>
        ),
      });
      
      // 5. Reset della configurazione (opzionale, dipende dall'UX che vuoi offrire)
      // Se vuoi che l'utente possa aggiungere più varianti, lascia la configurazione
      // altrimenti resetta:
      /*
      setScelte((prev) => ({
        ...prev,
        [prodottoId]: {},
      }));
      
      // Resetta anche l'immagine default se necessario
      setImmagini((prev) => ({
        ...prev,
        [prodottoId]: prodotto.immagine_url,
      }));
      */
      
    } catch (error) {
      productsLogger.error("Errore nell'aggiunta al carrello:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiunta al carrello. Riprova.",
        variant: "destructive",
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Funzione: Aggiunge al carrello una configurazione specifica di ricerca
  // ─────────────────────────────────────────────────────────────────────────────
  const handleAggiungiCombinazione = async (prodottoId: number, codice: string, configurazione: Record<string, string>, immagineUrl: string) => {
    try {
      const prodotto = prodotti.find((p) => p.id === prodottoId);
      if (!prodotto) {
        toast({
          title: "Errore",
          description: "Prodotto non trovato. Riprova.",
          variant: "destructive",
        });
        return;
      }
      
      // Controllo di sicurezza: verifica se la configurazione è completa
      // Questo controllo viene fatto prima di tutto, per evitare operazioni inutili
      if (!checkConfigurazioneValidaRicerca(prodottoId, configurazione)) {
        toast({
          title: "Configurazione incompleta",
          description: "La configurazione del prodotto è incompleta. Seleziona tutte le opzioni necessarie.",
          variant: "destructive",
        });
        return;
      }
      
      // Genera una chiave univoca per questa combinazione
      const comboKey = `${prodottoId}-${codice}`;
      
      // Ottieni la quantità specifica per questa combinazione
      const quantitaSpecifica = quantitaCombo[comboKey] || 1;
      
      // 1. Validazione "smart" prima di aggiungere al carrello
      // Estrai gli ID dei valori dalla configurazione
      const valoreIds: number[] = [];
      
      // Estrai gli ID dei valori dalla configurazione
      for (const [chiave, valore] of Object.entries(configurazione)) {
        const caratteristica = prodotto.caratteristiche.find(c => 
          c.chiave_configurazione.toLowerCase() === chiave.toLowerCase()
        );
        
        if (caratteristica) {
          const valoreCaratteristica = prodotto.valori_caratteristiche.find(v => 
            v.caratteristica_id === caratteristica.caratteristica_id && 
            normalizzaValore(v.valore) === normalizzaValore(valore)
          );
          
          if (valoreCaratteristica) {
            valoreIds.push(valoreCaratteristica.id);
          }
        }
      }
      
      // Verifica visibilità di tutti i valori selezionati
      for (const valoreId of valoreIds) {
        const valoreVisibile = await verificaValoreVisibile(valoreId);
        if (!valoreVisibile) {
          toast({
            title: "Configurazione non disponibile",
            description: "Questa configurazione non è più disponibile. Prova con un'altra combinazione.",
            variant: "destructive",
          });
          return;
        }
      }
      
      // 2. Ordine predefinito delle chiavi per consistenza tra modalità ricerca e normale
      const ordineChiavi = ["tipologia", "formato", "confezione"];
      
      // Ordina le chiavi della configurazione secondo l'ordine stabilito
      const configurazioneOrdinata: Record<string, string> = {};
      
      // Prima inserisci le chiavi nell'ordine specificato
      ordineChiavi.forEach(chiave => {
        // Cerca la chiave nel configurazione (case insensitive)
        const trovata = Object.keys(configurazione).find(k => 
          k.toLowerCase() === chiave.toLowerCase()
        );
        
        if (trovata && configurazione[trovata]) {
          configurazioneOrdinata[trovata] = configurazione[trovata];
        }
      });
      
      // Poi aggiungi eventuali altre chiavi che non sono nell'ordine predefinito
      Object.keys(configurazione).forEach(chiave => {
        if (!ordineChiavi.includes(chiave.toLowerCase()) && configurazione[chiave]) {
          configurazioneOrdinata[chiave] = configurazione[chiave];
        }
      });
      
      // 3. Aggiungi al carrello utilizzando la configurazione ordinata
      // Chiamiamo la funzione senza await per evitare il warning TypeScript
      addToCart({
        product: {
          id: prodotto.id,
          nome: prodotto.nome,
          descrizione: prodotto.descrizione,
          immagine_url: prodotto.immagine_url,
        },
        configurazione: configurazioneOrdinata,
        immagine_url: immagineUrl,
        quantity: quantitaSpecifica,
      });
      
      // 4. Feedback utente positivo (con codice prodotto)
      const descrizioneConfig = formatConfigurazione(configurazioneOrdinata, prodottoId).join(", ");
      
      toast({
        title: "Prodotto aggiunto",
        description: (
          <div className="flex flex-col space-y-1">
            <div>{`${prodotto.nome} ${descrizioneConfig ? `(${descrizioneConfig})` : ""} aggiunto all'ordine.`}</div>
            <div className="flex items-center mt-1">
              <CodiceProdotto 
                prodottoId={prodottoId} 
                configurazione={configurazioneOrdinata}
                className="ml-0 mt-0.5"
              />
            </div>
          </div>
        ),
      });
      
    } catch (error) {
      productsLogger.error("Errore nell'aggiunta al carrello:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiunta al carrello. Riprova.",
        variant: "destructive",
      });
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Dialog per visualizzare l'immagine ingrandita
  // ─────────────────────────────────────────────────────────────────────────────
  const openImageDialog = (prodotto: ProdottoDinamico) => {
    setCurrentProduct(prodotto);
    setIsImageDialogOpen(true);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render principale
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <h3 className="text-lg font-medium text-red-800">Errore!</h3>
          <p className="mt-2 text-red-700">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            variant="destructive"
            className="mt-4"
          >
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8">
      {/* Header con titolo e barra di ricerca allineati */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-semibold mb-4 sm:mb-0">I nostri prodotti</h1>
        
        {/* Campo di ricerca per codice prodotto ottimizzato e ridimensionato */}
        <div className="search-box relative w-full sm:w-64 lg:w-72">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <Input
            type="text"
            placeholder="Cerca codice..."
            value={termineDiRicerca}
            onChange={(e) => setTermineDiRicerca(e.target.value)}
            maxLength={8}
            className="pl-10 pr-8 py-2 h-10 transition-all border-slate-200 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm"
          />
          {termineDiRicerca && (
            <button
              onClick={() => {
                setTermineDiRicerca("");
                // Resetta esplicitamente le configurazioni quando si clicca sulla X
                resetProdottiConfigurazioni();
              }}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-500"
              aria-label="Cancella ricerca"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {/* Messaggi di ricerca */}
      {(searchNoResults || (termineDiRicerca && prodottiFiltrati.length > 0 && prodottiFiltrati.length < prodotti.length)) && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center ${
          searchNoResults 
            ? "bg-amber-50 text-amber-700 border border-amber-100" 
            : "bg-green-50 text-green-700 border border-green-100"
        }`}>
          {searchNoResults ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Nessun prodotto trovato con il codice "<strong>{termineDiRicerca}</strong>".</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Trovato {risultatiCombinazioni.length} {risultatiCombinazioni.length === 1 ? 'configurazione' : 'configurazioni'} con codice "<strong>{termineDiRicerca}</strong>".</span>
            </>
          )}
        </div>
      )}

      {/* Griglia prodotti - mostra solo se ci sono risultati */}
      {!searchNoResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-6">
          {termineDiRicerca.trim() !== "" && risultatiCombinazioni.length > 0 ? (
            /* Quando c'è ricerca: mostra tutte le combinazioni trovate */
            risultatiCombinazioni.map((risultato, index) => {
              const prodotto = risultato.prodotto;
              if (!prodotto) return null; // Skip se non esiste prodotto
              
              return (
                <div key={`${risultato.codice}-${index}`} className="product-card">
                  <div className="product-card-wrapper">
                    {/* Sezione immagine */}
                    <div className="product-card-image-section">
                      <img
                        src={risultato.immagine_url || prodotto.immagine_url}
                        alt={prodotto.nome}
                        className="product-card-image"
                        onClick={() => openImageDialog(prodotto)}
                      />
                      {/* Codice prodotto */}
                      {risultato.codice && (
                        <div className="product-code-badge">
                          {risultato.codice}
                        </div>
                      )}
                      <div 
                        className="product-card-zoom" 
                        onClick={(e) => {
                          e.stopPropagation();
                          openImageDialog(prodotto);
                        }}
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
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Contenuto e opzioni */}
                    <div className="product-card-content">
                      <h2 className="product-card-title">{prodotto.nome}</h2>
                      <p className="product-card-description">
                        {prodotto.descrizione}
                      </p>
                      
                      {/* Caratteristiche - con flex-grow per riempire lo spazio disponibile */}
                      <div className="product-options flex-grow">
                        {prodotto.caratteristiche.map((car) => {
                          const chiaveNorm = car.chiave_configurazione
                            .toLowerCase()
                            .trim();
                          // In modalità ricerca otteniamo tutte le opzioni disponibili per questa caratteristica
                          // senza filtrarle in base alle selezioni precedenti
                          const opzioniDisponibili = prodotto.valori_caratteristiche
                            .filter(v => v.caratteristica_id === car.caratteristica_id)
                            .sort((a, b) => a.ordine - b.ordine);
                          
                          // In modalità ricerca, utilizziamo direttamente la configurazione del risultato
                          // Non passiamo tramite lo stato globale scelte per evitare sovrapposizioni
                          const valoreNorm = risultato.configurazione[chiaveNorm] || "";
                          
                          // Valore selezionato per questa specifica caratteristica
                          let valoreSelezionato;
                          if (valoreNorm) {
                            // Cerca il valore esatto tra quelli disponibili
                            valoreSelezionato = opzioniDisponibili.find(
                              (v) => normalizzaValore(v.valore || "") === valoreNorm
                            )?.valore;
                          } else {
                            // Se non c'è una configurazione specifica per questa caratteristica
                            valoreSelezionato = "";
                          }
                          
                          // I debug specifici per formato e confezione sono stati rimossi per ottimizzazione
          
                          return (
                            <div key={car.id} className="product-option">
                              <div className="product-option-row">
                                <label className="product-option-label">
                                  {car.nome}
                                  {/* Mostra asterisco per campi obbligatori o campi diventati obbligatori in base alle selezioni */}
                                  {!termineDiRicerca.trim() && (
                                    (
                                      // Caso 1: Campo esplicitamente obbligatorio non ancora compilato
                                      (car.obbligatoria && opzioniDisponibili.length > 0 && !scelte[prodotto.id]?.[chiaveNorm]) ||
                                      // Caso 2: Campo diventato obbligatorio in base alle selezioni precedenti
                                      (!car.obbligatoria && isDinamicallyRequired(prodotto.id, chiaveNorm) && opzioniDisponibili.length > 0 && !scelte[prodotto.id]?.[chiaveNorm])
                                    ) && (
                                      <span className="product-option-required">*</span>
                                    )
                                  )}
                                </label>
                                {/* Mostriamo il contatore opzioni solo quando non siamo in modalità ricerca */}
                                {!termineDiRicerca.trim() && (
                                  <span className="product-option-count">
                                    {opzioniDisponibili.length} opz.
                                  </span>
                                )}
                              </div>
                              {/* Utilizziamo uno speciale elemento visivo simile a una select ma non interattivo */}
                              <div className="product-option-select-plain product-option-disabled flex items-center px-3">
                                <span className="text-sm text-slate-500">
                                  {valoreSelezionato 
                                    ? valoreSelezionato 
                                    : `-- Nessuna ${car.nome.toLowerCase().replace('seleziona ', '')} disponibile --`}
                                </span>
                                {/* Icona di blocco */}
                                <svg className="ml-auto h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Se non ci sono caratteristiche */}
                      {prodotto.caratteristiche.length === 0 && (
                        <div className="py-3 text-center text-sm text-slate-500">
                          Questo prodotto non ha opzioni configurabili.
                        </div>
                      )}
          
                      {/* Sezione controlli con layout a griglia fisso */}
                      <div className="product-card-footer">
                        {/* Label quantità con tooltip informativo */}
                        <div className="qty-label flex items-center">
                          Quantità:
                          <div className="relative ml-1 group">
                            <div className="flex items-center justify-center w-4 h-4 text-xs text-white bg-slate-400 rounded-full cursor-help">
                              ?
                            </div>
                            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block bg-white border border-slate-200 rounded shadow-md p-2 text-xs text-slate-600 w-48 z-50">
                              Numero di unità del prodotto mostrato nell'immagine, con la configurazione selezionata.
                            </div>
                          </div>
                        </div>
                        
                        {/* Sistema a griglia per controlli perfettamente proporzionati */}
                        <div className="cart-controls-grid quantity-controls">
                          {/* Controlli quantità (span 5/12) */}
                          <div className="qty-control-container">
                            <div className="qty-stepper">
                              {/* Genera una chiave univoca per questa combinazione */}
                              {(() => {
                                const comboKey = `${prodotto.id}-${risultato.codice}`;
                                return (
                                  <>
                                    <button
                                      onClick={() => updateComboQuantity(comboKey, -1)}
                                      className="qty-btn"
                                      aria-label="Diminuisci quantità"
                                    >
                                      <span className="inline-flex h-full w-full items-center justify-center">−</span>
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      value={quantitaCombo[comboKey] === 0 ? "" : quantitaCombo[comboKey] || 1}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === "") {
                                          setQuantitaCombo((prev) => ({
                                            ...prev,
                                            [comboKey]: 0,
                                          }));
                                          return;
                                        }

                                        const cleaned = value.replace(/\D/g, "");
                                        const parsed = parseInt(cleaned, 10);

                                        if (isNaN(parsed)) {
                                          setQuantitaCombo((prev) => ({
                                            ...prev,
                                            [comboKey]: 0,
                                          }));
                                        } else if (parsed > 9999) {
                                          setQuantitaCombo((prev) => ({
                                            ...prev,
                                            [comboKey]: 9999,
                                          }));
                                        } else {
                                          setQuantitaCombo((prev) => ({
                                            ...prev,
                                            [comboKey]: parsed,
                                          }));
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const value = parseInt(e.target.value || "0", 10);
                                        if (!value || value < 1) {
                                          setQuantitaCombo((prev) => ({
                                            ...prev,
                                            [comboKey]: 1,
                                          }));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.currentTarget.blur(); // Forza il blur per applicare il valore
                                        }
                                      }}
                                      className="qty-input"
                                      aria-label="Quantità"
                                    />
                                    <button
                                      onClick={() => updateComboQuantity(comboKey, 1)}
                                      className="qty-btn"
                                      aria-label="Aumenta quantità"
                                    >
                                      <span className="inline-flex h-full w-full items-center justify-center">+</span>
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          
                          {/* Pulsante aggiungi (span 7/12) */}
                          <div className="add-btn-container">
                            <button
                              onClick={() => {
                                // Aggiungi al carrello utilizzando la funzione specifica per combinazioni
                                handleAggiungiCombinazione(
                                  prodotto.id, 
                                  risultato.codice, 
                                  risultato.configurazione, 
                                  risultato.immagine_url || prodotto.immagine_url
                                );
                              }}
                              disabled={!checkConfigurazioneValidaRicerca(prodotto.id, risultato.configurazione || {})}
                              className={`cart-add-btn add-to-cart-button ${!checkConfigurazioneValidaRicerca(prodotto.id, risultato.configurazione || {}) ? 'disabled-btn' : ''}`}
                              aria-label="Aggiungi all'ordine"
                              title={!checkConfigurazioneValidaRicerca(prodotto.id, risultato.configurazione || {}) ? 
                                "Questa configurazione del prodotto è incompleta" : 
                                "Aggiungi al carrello"}
                            >
                              <svg className="cart-btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="9" cy="21" r="1" />
                                <circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                              </svg>
                              <span className="cart-btn-text">Aggiungi</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            /* Quando non c'è ricerca: mostra vista normale */
            prodottiFiltrati.map((prodotto) => (
              <div key={prodotto.id} className="product-card">
                <div className="product-card-wrapper">
                  {/* Sezione immagine */}
                  <div className="product-card-image-section">
                    <img
                      src={immagini[prodotto.id] || prodotto.immagine_url}
                      alt={prodotto.nome}
                      className="product-card-image"
                      onClick={() => openImageDialog(prodotto)}
                    />
                    {/* Codice prodotto */}
                    {codiciProdotto[prodotto.id] && (
                      <div className="product-code-badge">
                        {codiciProdotto[prodotto.id]}
                      </div>
                    )}
                    <div 
                      className="product-card-zoom" 
                      onClick={(e) => {
                        e.stopPropagation();
                        openImageDialog(prodotto);
                      }}
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
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  
                  {/* Contenuto e opzioni */}
                  <div className="product-card-content">
                    <h2 className="product-card-title">{prodotto.nome}</h2>
                    <p className="product-card-description">
                      {prodotto.descrizione}
                    </p>
                    
                    {/* Caratteristiche - con flex-grow per riempire lo spazio disponibile */}
                    <div className="product-options flex-grow">
                      {prodotto.caratteristiche.map((car) => {
                        const chiaveNorm = car.chiave_configurazione
                          .toLowerCase()
                          .trim();
                        const opzioniDisponibili = getValoriDisponibili(
                          prodotto.id,
                          chiaveNorm,
                        );
                        const isSelezionabile = isCaratteristicaSelezionabile(
                          prodotto.id,
                          chiaveNorm,
                        );
                        const precedenteNome = !isSelezionabile
                          ? getCaratteristicaPrecedente(prodotto.id, chiaveNorm)
                          : "";
        
                        // Valore selezionato (se esiste)
                        const valoreSelezionato = opzioniDisponibili.find(
                          (v) =>
                            normalizzaValore(v.valore || "") ===
                            (scelte[prodotto.id]?.[chiaveNorm] || ""),
                        )?.valore;
        
                        return (
                          <div key={car.id} className="product-option">
                            <div className="product-option-row">
                              <label className="product-option-label">
                                {car.nome}
                                {/* Mostra asterisco per campi obbligatori o campi che sono diventati obbligatori dinamicamente */}
                                {(
                                  // Caso 1: Campo esplicitamente obbligatorio non ancora compilato
                                  (car.obbligatoria && isSelezionabile && !scelte[prodotto.id]?.[chiaveNorm]) ||
                                  // Caso 2: Campo diventato obbligatorio in base alle selezioni precedenti
                                  (!car.obbligatoria && isSelezionabile && isDinamicallyRequired(prodotto.id, chiaveNorm) && !scelte[prodotto.id]?.[chiaveNorm])
                                ) && (
                                  <span className="product-option-required">*</span>
                                )}
                              </label>
                              {/* Mostriamo il contatore opzioni solo quando non siamo in modalità ricerca */}
                              {!termineDiRicerca.trim() && (
                                <span className="product-option-count">
                                  {opzioniDisponibili.length} opz.
                                </span>
                              )}
                            </div>
                            {/* 
                              Tre casi possibili:
                              1. Menu non selezionabile (dipende da precedente)
                              2. Menu senza opzioni disponibili (0 opz)
                              3. Menu normale selezionabile
                            */}
                            {!isSelezionabile || opzioniDisponibili.length === 0 ? (
                              <div className="product-option-select-plain product-option-disabled flex items-center px-3">
                                <span className="text-sm text-slate-500 option-text">
                                  {(() => {
                                    // Menu selezionabile ma senza opzioni
                                    if (opzioniDisponibili.length === 0 && isSelezionabile) {
                                      return `-- Nessuna ${car.nome.toLowerCase().replace('seleziona ', '')} disponibile --`;
                                    }
                                    // Menu non selezionabile → mostra "Prima seleziona X" se c'è un precedente
                                    if (!isSelezionabile) {
                                      const precedenteNome = getCaratteristicaPrecedente(prodotto.id, chiaveNorm);
                                      if (precedenteNome && precedenteNome.trim() !== "") {
                                        return `-- Prima seleziona ${precedenteNome.toLowerCase().replace('seleziona ', '')} --`;
                                      }
                                    }
                                    // Default message
                                    return `-- Seleziona ${car.nome.toLowerCase().replace('seleziona ', '')} --`;
                                  })()}
                                </span>
                                {/* Icona blocco a destra */}
                                <svg className="ml-auto h-4 w-4 text-slate-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                              </div>
                            ) : (
                              <select
                                value={valoreSelezionato || ""}
                                onChange={(e) =>
                                  handleChange(
                                    prodotto.id,
                                    car.chiave_configurazione,
                                    e.target.value
                                  )
                                }
                                className={`product-option-select product-selector ${isSelezionabile ? 'selezionabile' : 'non-selezionabile'}`}
                                aria-disabled={!isSelezionabile}
                              >
                                <option value="">
                                  {(() => {
                                    // Estrai il nome della caratteristica senza eventuali prefissi "seleziona"
                                    const getNomePulito = (nome: string) => {
                                      nome = nome.toLowerCase();
                                      return nome.startsWith("seleziona ") ? nome.substring(10) : nome;
                                    };
                                    
                                    const nomePulito = getNomePulito(car.nome);
                                    return `-- Seleziona ${nomePulito} --`;
                                  })()}
                                </option>
                                {opzioniDisponibili.map((val) => (
                                  <option
                                    key={
                                      val.id ?? `${val.caratteristica_id}-${val.valore}`
                                    }
                                    value={val.valore}
                                  >
                                    {val.descrizione?.trim()
                                      ? `${val.valore} (${val.descrizione})`
                                      : val.valore}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Se non ci sono caratteristiche */}
                    {prodotto.caratteristiche.length === 0 && (
                      <div className="py-3 text-center text-sm text-slate-500">
                        Questo prodotto non ha opzioni configurabili.
                      </div>
                    )}
        
                    {/* Sezione controlli con layout a griglia fisso */}
                    <div className="product-card-footer">
                      {/* Label quantità */}
                      <div className="qty-label flex items-center">
                        Quantità:
                        <div className="relative ml-1 group">
                          <div className="flex items-center justify-center w-4 h-4 text-xs text-white bg-slate-400 rounded-full cursor-help">
                            ?
                          </div>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-white border border-slate-200 rounded shadow-md p-2 text-xs text-slate-600 w-48 z-50">
                            Numero di unità del prodotto mostrato nell'immagine, con la configurazione selezionata.
                          </div>
                        </div>
                      </div>
                      
                      {/* Sistema a griglia per controlli perfettamente proporzionati */}
                      <div className="cart-controls-grid">
                        {/* Controlli quantità (span 5/12) */}
                        <div className="qty-control-container">
                          <div className="qty-stepper">
                            <button
                              onClick={() => updateQuantity(prodotto.id, -1)}
                              className="qty-btn"
                              aria-label="Diminuisci quantità"
                            >
                              <span className="inline-flex h-full w-full items-center justify-center">−</span>
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={quantita[prodotto.id] === 0 ? "" : quantita[prodotto.id] || 1}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "") {
                                  setQuantita((prev) => ({
                                    ...prev,
                                    [prodotto.id]: 0,
                                  }));
                                  return;
                                }

                                const cleaned = value.replace(/\D/g, "");
                                const parsed = parseInt(cleaned, 10);

                                if (isNaN(parsed)) {
                                  setQuantita((prev) => ({
                                    ...prev,
                                    [prodotto.id]: 0,
                                  }));
                                } else if (parsed > 9999) {
                                  setQuantita((prev) => ({
                                    ...prev,
                                    [prodotto.id]: 9999,
                                  }));
                                } else {
                                  setQuantita((prev) => ({
                                    ...prev,
                                    [prodotto.id]: parsed,
                                  }));
                                }
                              }}
                              onBlur={(e) => {
                                const value = parseInt(e.target.value || "0", 10);
                                if (!value || value < 1) {
                                  setQuantita((prev) => ({
                                    ...prev,
                                    [prodotto.id]: 1,
                                  }));
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur(); // Forza il blur per applicare il valore
                                }
                              }}
                              className="qty-input"
                              aria-label="Quantità"
                            />
                            <button
                              onClick={() => updateQuantity(prodotto.id, 1)}
                              className="qty-btn"
                              aria-label="Aumenta quantità"
                            >
                              <span className="inline-flex h-full w-full items-center justify-center">+</span>
                            </button>
                          </div>
                        </div>
                        
                        {/* Pulsante aggiungi (span 7/12) */}
                        <div className="add-btn-container">
                          <button
                            onClick={() => handleAggiungi(prodotto.id)}
                            disabled={!checkTutteObbligatorieSelezionate(prodotto.id)}
                            className="cart-add-btn add-to-cart-button"
                            aria-label="Aggiungi all'ordine"
                          >
                            <svg className="cart-btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="9" cy="21" r="1" />
                              <circle cx="20" cy="21" r="1" />
                              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                            </svg>
                            <span className="cart-btn-text">Aggiungi</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Messaggio per le opzioni obbligatorie - mostra solo se ci sono opzioni obbligatorie non selezionate */}
                      {prodotto.caratteristiche.some(c => c.obbligatoria) && 
                       !checkTutteObbligatorieSelezionate(prodotto.id) && (
                        <div className="options-required-warning">
                          Seleziona tutte le opzioni obbligatorie
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      
      {/* Dialog per visualizzare l'immagine ingrandita */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-xl p-1 sm:p-3">
          <DialogTitle className="sr-only">
            Immagine ingrandita {currentProduct?.nome}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Ingrandimento dell'immagine selezionata per il prodotto
          </DialogDescription>

          <div className="w-full h-full max-h-[80vh] overflow-hidden relative">
            {currentProduct && (
              <>
                <img
                  src={immagini[currentProduct.id] || currentProduct.immagine_url}
                  alt={currentProduct.nome}
                  className="w-full h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
                {/* Codice prodotto anche nella visualizzazione ingrandita */}
                {codiciProdotto[currentProduct.id] && (
                  <div className="absolute top-4 left-4 product-code-badge">
                    {codiciProdotto[currentProduct.id]}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Pulsante "Torna in alto" con componente riutilizzabile */}
      <ScrollToTop />
    </div>
  );
}