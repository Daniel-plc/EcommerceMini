import { createClient } from '@supabase/supabase-js';
import { normalizzaCaratteristiche, normalizzaValori, compareConfigurations } from './utils';
import { ProdottoDinamico, CartItem } from './model';
import { getImmagineProdottoDinamicaOptimized, precaricaImmaginiProdotti } from './image-cache';
import logger from './logger';

// Logger specifico per il modulo Supabase
const supabaseLogger = logger.createLogger('Supabase');

export { precaricaImmaginiProdotti };

// Esporta la versione ottimizzata al posto della vecchia implementazione
export const getImmagineProdottoDinamica = getImmagineProdottoDinamicaOptimized;

// Get Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Verifica delle credenziali Supabase
if (!supabaseUrl || !supabaseAnonKey) {
  supabaseLogger.error('Mancano le variabili di ambiente per Supabase. Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Importa le funzioni cart-utils
import {
  getCartKey,
  migrateGuestCart,
  migrateLegacyCart,
  addToCart,
  getCartItems,
  removeFromCart,
  updateCartItemQuantity,
  clearCart
} from './cart-utils';

// Ri-esporta le funzioni per retrocompatibilità
export {
  getCartKey,
  migrateGuestCart,
  migrateLegacyCart,
  addToCart,
  getCartItems,
  removeFromCart,
  updateCartItemQuantity,
  clearCart
};

// Costante per la chiave di sessione
export const USER_CACHE_KEY = "sb_session";

/**
 * Recupera tutti i prodotti con le relative caratteristiche e valori disponibili
 * Utilizza una query con join per efficienza
 */
export const getProdottiDinamici = async (): Promise<ProdottoDinamico[]> => {
  try {
    const { data, error } = await supabase
      .from("prodotti")
      .select(`
        id, nome, descrizione, immagine_url, visibile, ordine,
        prodotti_caratteristiche (
          id, caratteristica_id, visibile, obbligatoria, ordine,
          caratteristiche (
            id, nome, nome_label
          )
        ),
        prodotti_valori_caratteristiche (
          id, valore_id, visibile,
          valori_caratteristiche (
            id, caratteristica_id, valore, descrizione, ordine
          )
        )
      `)
      .eq("visibile", true)
      .order("ordine");

    if (error) {
      supabaseLogger.error('Errore nel recupero dei prodotti dinamici:', error);
      return [];
    }

    return (data || []).map((p) => {
      // Filtriamo solo le caratteristiche visibili
      const caratteristiche = normalizzaCaratteristiche(p);
      
      // Filtriamo solo i valori visibili
      const valori_caratteristiche = normalizzaValori(p); 
      
      return {
        id: p.id,
        nome: p.nome,
        descrizione: p.descrizione,
        immagine_url: p.immagine_url,
        caratteristiche,
        valori_caratteristiche
      };
    });
  } catch (error) {
    supabaseLogger.error('Errore nel recupero dei prodotti dinamici:', error);
    return [];
  }
};

/**
 * La vecchia implementazione di getImmagineProdottoDinamica è stata sostituita
 * con la versione ottimizzata importata da image-cache.ts, che include:
 * - Cache delle immagini per prodotto
 * - Cache delle configurazioni per evitare richieste ripetute
 * - Precaricamento fisico delle immagini nel browser
 * - Gestione ottimizzata dei campi immagine_url vs url
 */

/**
 * Cache per i codici prodotto, per ridurre le chiamate API
 * - Livello 1: Cache per prodotto - memorizza tutti i dati per un prodotto specifico
 * - Livello 2: Cache per configurazione - memorizza il risultato per una specifica configurazione
 */
const codiciProdottoCache: {
  perProdotto: Record<number, {data: any[], timestamp: number}>,
  perConfigurazione: Record<string, {codice: string | null, timestamp: number}>
} = {
  perProdotto: {},
  perConfigurazione: {}
};

// Il TTL della cache in millisecondi (10 minuti)
const PRODUCT_CACHE_TTL = 10 * 60 * 1000;

/**
 * Recupera il codice prodotto dato un prodotto ID e una configurazione specifica
 * Implementa sistema di cache avanzato a due livelli per migliorare significativamente le performance
 * Con gestione errori avanzata e logging dettagliato per il troubleshooting
 * 
 * @param prodottoId ID del prodotto
 * @param configurazione Oggetto con la configurazione selezionata
 * @returns Il codice prodotto se trovato, altrimenti null
 */
export const getCodiceProdotto = async (
  prodottoId: number, 
  configurazione: Record<string, string>,
  priority: boolean = false
): Promise<string | null> => {
  if (!prodottoId) {
    supabaseLogger.warn("getCodiceProdotto chiamato con prodottoId nullo o non valido");
    return null;
  }
  
  if (!configurazione || Object.keys(configurazione).length === 0) {
    supabaseLogger.debug(`getCodiceProdotto: configurazione vuota per prodotto ${prodottoId}`);
  }

  try {
    // Normalizza la configurazione per il confronto (lowercase e no spazi)
    const configNormalizzata = Object.fromEntries(
      Object.entries(configurazione).map(([k, v]) => [
        k.toLowerCase().replace(/\s+/g, ""),
        typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, "") : String(v),
      ])
    );

    // Crea una chiave di cache basata sul prodottoId e la configurazione normalizzata
    const configStr = JSON.stringify(configNormalizzata);
    const cacheKey = `${prodottoId}:${configStr}`;
    
    // LIVELLO 2: Verifica se questa esatta configurazione è già in cache
    const now = Date.now();
    const cachedConfig = codiciProdottoCache.perConfigurazione[cacheKey];
    if (cachedConfig && (now - cachedConfig.timestamp) < PRODUCT_CACHE_TTL) {
      supabaseLogger.debug(`Codice prodotto trovato in cache L2 per ${prodottoId} con config: ${configStr.substring(0, 40)}...`);
      return cachedConfig.codice;
    }
    
    // LIVELLO 1: Verifica se abbiamo già i dati per questo prodotto in cache
    const cachedProduct = codiciProdottoCache.perProdotto[prodottoId];
    let data;
    
    if (cachedProduct && (now - cachedProduct.timestamp) < PRODUCT_CACHE_TTL) {
      // Usa i dati dalla cache
      data = cachedProduct.data;
      supabaseLogger.debug(`Utilizzando ${data.length} configurazioni dalla cache L1 per prodotto ${prodottoId}`);
    } else {
      // Recupera tutte le immagini per questo prodotto
      supabaseLogger.debug(`Recupero configurazioni da Supabase per prodotto ${prodottoId}`);
      
      const { data: fetchedData, error } = await supabase
        .from("immagini_prodotti_dinamiche")
        .select("codice_prodotto, configurazione")
        .eq("prodotto_id", prodottoId);

      if (error) {
        supabaseLogger.error(
          `Errore Supabase nel recupero configurazioni per prodotto ${prodottoId}:`, 
          { error, codice: error.code, messaggio: error.message }
        );
        
        // Aggiorna la cache di livello 2 con risultato negativo ma con TTL ridotto
        // per permettere nuovi tentativi più rapidamente in caso di errori temporanei
        codiciProdottoCache.perConfigurazione[cacheKey] = { 
          codice: null, 
          timestamp: now - (PRODUCT_CACHE_TTL / 2) // Cache con durata dimezzata per riprovare prima
        };
        
        // Memorizza un array vuoto nella cache di livello 1 con TTL ridotto
        codiciProdottoCache.perProdotto[prodottoId] = {
          data: [],
          timestamp: now - (PRODUCT_CACHE_TTL / 2) // Cache con durata dimezzata
        };
        
        return null;
      }
      
      if (!fetchedData || fetchedData.length === 0) {
        supabaseLogger.info(`Nessuna configurazione trovata per prodotto ID: ${prodottoId}`);
        
        // Aggiorna la cache di livello 2 con risultato negativo
        codiciProdottoCache.perConfigurazione[cacheKey] = { 
          codice: null, 
          timestamp: now 
        };
        
        // Memorizza un array vuoto nella cache di livello 1
        codiciProdottoCache.perProdotto[prodottoId] = {
          data: [],
          timestamp: now
        };
        
        return null;
      }
      
      supabaseLogger.debug(`Recuperate ${fetchedData.length} configurazioni per prodotto ${prodottoId}`);
      
      // Memorizza nella cache di livello 1
      codiciProdottoCache.perProdotto[prodottoId] = {
        data: fetchedData,
        timestamp: now
      };
      
      data = fetchedData;
    }

    // Cerca la configurazione corrispondente
    const matchingImage = data.find(item => {
      // Se non ha configurazione, salta
      if (!item.configurazione) return false;
      
      try {
        // Normalizza la configurazione dell'immagine
        const imgConfig = Object.fromEntries(
          Object.entries(item.configurazione).map(([k, v]) => [
            k.toLowerCase().replace(/\s+/g, ""),
            String(v).toLowerCase().replace(/\s+/g, ""),
          ])
        );
        
        // Confronta le configurazioni
        const configKeys = Object.keys(configNormalizzata);
        const imgKeys = Object.keys(imgConfig);
        
        // Se hanno numero diverso di chiavi, non è un match
        if (configKeys.length !== imgKeys.length) return false;
        
        // Verifica che tutte le chiavi-valore corrispondano
        for (const key of configKeys) {
          if (!imgKeys.includes(key) || imgConfig[key] !== configNormalizzata[key]) {
            return false;
          }
        }
        
        return true;
      } catch (matchError) {
        // Gestione sicura degli errori durante il matching per evitare crash
        supabaseLogger.error(
          `Errore nel confronto configurazione per prodotto ${prodottoId}:`, 
          { 
            error: matchError, 
            configurazione: item.configurazione 
          }
        );
        return false;
      }
    });

    const result = matchingImage?.codice_prodotto || null;
    
    // Memorizza il risultato nella cache di livello 2
    codiciProdottoCache.perConfigurazione[cacheKey] = {
      codice: result,
      timestamp: now
    };
    
    if (result) {
      supabaseLogger.debug(`Trovato codice "${result}" per prodotto ${prodottoId}`);
    } else {
      supabaseLogger.debug(`Nessun codice trovato per prodotto ${prodottoId} con configurazione specificata`);
    }
    
    return result;
  } catch (error: any) {
    // Gestione più dettagliata dell'errore per facilitare il troubleshooting
    const errorMessage = error?.message || 'Errore sconosciuto';
    supabaseLogger.error(
      `Errore critico nel recuperare il codice prodotto per ID ${prodottoId}: ${errorMessage}`,
      { 
        stack: error?.stack,
        name: error?.name,
        configurazione: JSON.stringify(configurazione).substring(0, 100)
      }
    );
    return null;
  }
};

/**
 * Precarica i codici prodotto per un array di prodotti
 * Ottimizzazione avanzata: riduce drasticamente le chiamate API raggruppandole
 * @param prodottiIds Array di ID prodotto
 */
/**
 * Precarica i codici prodotto per una lista di ID prodotto
 * con gestione avanzata degli errori, prioritizzazione e caricamento asincrono.
 * 
 * @param prodottiIds Array di ID prodotto da precaricare
 * @returns Promise vuota che si risolve al completamento
 */
export const precaricaCodiciProdotto = async (prodottiIds: number[], priority: boolean = false): Promise<void> => {
  if (!prodottiIds || prodottiIds.length === 0) {
    return; // Nessun logging necessario
  }

  try {
    const now = Date.now();
    
    // Filtra e prioritizza i prodotti per il caricamento
    const nonCachedProducts: number[] = [];
    const expiredCachedProducts: number[] = [];
    
    prodottiIds.forEach(id => {
      const cachedProduct = codiciProdottoCache.perProdotto[id];
      if (!cachedProduct) {
        // Priorità alta: prodotti mai caricati
        nonCachedProducts.push(id);
      } else if ((now - cachedProduct.timestamp) >= PRODUCT_CACHE_TTL) {
        // Priorità bassa: prodotti con cache scaduta
        expiredCachedProducts.push(id);
      }
    });
    
    // Ordina per priorità: prima prodotti senza cache, poi quelli con cache scaduta
    const prodottiDaCaricare = [...nonCachedProducts, ...expiredCachedProducts];
    
    if (prodottiDaCaricare.length === 0) {
      return; // Tutti i codici sono già in cache valida
    }
    
    // Recupera i dati per tutti i prodotti in un'unica chiamata
    const { data, error } = await supabase
      .from("immagini_prodotti_dinamiche")
      .select("prodotto_id, codice_prodotto, configurazione")
      .in("prodotto_id", prodottiDaCaricare);
      
    if (error) {
      // Log dettagliato con informazioni contestuali
      supabaseLogger.error(
        `Errore Supabase nel precaricamento dei codici prodotto per ${prodottiDaCaricare.length} prodotti:`, 
        { error, codice: error.code, messaggio: error.message, prodottiIds: prodottiDaCaricare }
      );
      return;
    }
    
    if (!data || data.length === 0) {
      supabaseLogger.warn(
        `Nessun dato trovato per i codici prodotto richiesti: ${prodottiDaCaricare.join(', ')}`
      );
      return;
    }
    
    // Raggruppa i dati per prodotto_id
    const dataByProductId: Record<number, any[]> = {};
    data.forEach(item => {
      if (!dataByProductId[item.prodotto_id]) {
        dataByProductId[item.prodotto_id] = [];
      }
      dataByProductId[item.prodotto_id].push(item);
    });
    
    // Aggiorna la cache di livello 1 per ogni prodotto
    prodottiDaCaricare.forEach(id => {
      codiciProdottoCache.perProdotto[id] = {
        data: dataByProductId[id] || [],
        timestamp: now
      };
    });
    
    const prodottiTrovati = Object.keys(dataByProductId).length;
    const prodottiMancanti = prodottiDaCaricare.length - prodottiTrovati;
    
    if (prodottiMancanti > 0) {
      supabaseLogger.warn(
        `Precaricati ${prodottiTrovati}/${prodottiDaCaricare.length} codici prodotto. ${prodottiMancanti} prodotti non trovati.`
      );
    } else {
      supabaseLogger.info(`Precaricati codici per ${prodottiDaCaricare.length} prodotti con successo`);
    }
  } catch (error: any) {
    // Gestione più dettagliata dell'errore con più informazioni di contesto
    const errorMessage = error?.message || 'Errore sconosciuto';
    supabaseLogger.error(
      `Errore critico nel precaricamento dei codici prodotto: ${errorMessage}`,
      { 
        numProdotti: prodottiIds.length, 
        stack: error?.stack,
        name: error?.name
      }
    );
  }
};

// Definizione dell'interfaccia per le informazioni di consegna
export interface OrderDeliveryInfo {
  orario_inizio: string;
  orario_fine: string;
  giorni_esclusi: string[];
}

// Nome della chiave per il caching
const CONFIG_ORARI_CACHE_KEY = 'config_orari_data';
// Durata della cache (6 ore in millisecondi)
const CONFIG_ORARI_CACHE_TTL = 6 * 60 * 60 * 1000;

/**
 * Recupera le informazioni sugli orari di apertura e i giorni esclusi
 * con gestione cache efficiente e fallback a valori di default.
 * 
 * @param forceRefresh Se true, ignora la cache e forza il recupero dal database
 * @returns Oggetto con orari e giorni esclusi o null in caso di errore
 */
export async function getInfoOrderDelivery(forceRefresh = false): Promise<OrderDeliveryInfo | null> {
  try {
    // Controlla prima se ci sono dati in cache (a meno che non sia richiesto un refresh forzato)
    if (!forceRefresh) {
      const cachedData = getCachedConfigOrari();
      if (cachedData) {
        supabaseLogger.debug("Recuperate informazioni orari dalla cache locale");
        return cachedData;
      }
    } else {
      supabaseLogger.debug("Richiesto refresh forzato degli orari di servizio");
    }
    
    supabaseLogger.info("Recupero informazioni orari di servizio dal database");
    
    // Leggi dalla tabella config_report
    const { data: configData, error: configError } = await supabase
      .from('config_report')
      .select('*');
    
    // Log nel logger dell'applicazione, non in console
    supabaseLogger.debug('Recuperati dati da config_report:', 
      configData && configData.length > 0 ? {
        orario_inizio: configData[0].orario_inizio,
        orario_fine: configData[0].orario_fine,
        giorni_esclusi: configData[0].giorni_esclusi
      } : 'Nessun dato'
    );
    
    if (configError) {
      supabaseLogger.error('Errore nel recupero delle informazioni da config_report:', configError);
      return getDefaultOrderInfo();
    }
    
    if (!configData || configData.length === 0) {
      supabaseLogger.warn('Nessun dato trovato nella tabella config_report');
      return getDefaultOrderInfo();
    }
    
    // Accedi direttamente ai campi conosciuti dalla tabella
    const dbRecord = configData[0];
    
    // Crea il risultato utilizzando i valori della tabella quando disponibili,
    // altrimenti usa valori predefiniti
    const result: OrderDeliveryInfo = {
      giorni_esclusi: dbRecord.giorni_esclusi || [],
      orario_inizio: dbRecord.orario_inizio || '05:00',
      orario_fine: dbRecord.orario_fine || '21:00'
    };
    
    // Memorizza in cache
    cacheConfigOrari(result);
    supabaseLogger.debug("Informazioni orari recuperate con successo:", result);
    
    return result;
  } catch (error) {
    supabaseLogger.error('Errore imprevisto durante il recupero delle informazioni di orari:', error);
    return getDefaultOrderInfo();
  }
}

/**
 * Restituisce valori predefiniti per gli orari e i giorni esclusi
 */
function getDefaultOrderInfo(): OrderDeliveryInfo {
  return {
    orario_inizio: '05:00',
    orario_fine: '21:00',
    giorni_esclusi: []
  };
}

/**
 * Memorizza i dati degli orari nella cache locale
 */
function cacheConfigOrari(data: OrderDeliveryInfo): void {
  try {
    localStorage.setItem(CONFIG_ORARI_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    supabaseLogger.warn('Impossibile salvare i dati degli orari in cache:', e);
  }
}

/**
 * Recupera i dati degli orari dalla cache locale
 */
function getCachedConfigOrari(): OrderDeliveryInfo | null {
  try {
    const cachedItem = localStorage.getItem(CONFIG_ORARI_CACHE_KEY);
    if (!cachedItem) return null;
    
    const { data, timestamp } = JSON.parse(cachedItem);
    const now = Date.now();
    
    // Verifica se la cache è scaduta
    if (now - timestamp > CONFIG_ORARI_CACHE_TTL) {
      localStorage.removeItem(CONFIG_ORARI_CACHE_KEY);
      return null;
    }
    
    return data;
  } catch (e) {
    supabaseLogger.warn('Errore nel recupero dei dati degli orari dalla cache:', e);
    return null;
  }
}