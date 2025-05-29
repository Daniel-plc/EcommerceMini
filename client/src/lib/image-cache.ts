import { supabase } from './supabase';
import { compareConfigurations } from './utils';
import logger from './logger';

// Logger specifico per il modulo di cache immagini
const imageLogger = logger.createLogger('ImageCache');

/**
 * NOTA IMPORTANTE: Inconsistenza dei campi URL nelle tabelle del database
 * ----------------------------------------------------------------------
 * 
 * Le diverse tabelle del database utilizzano nomi di campo differenti per gli URL delle immagini:
 * 1. immagini_prodotti_dinamiche: utilizza il campo "immagine_url"
 * 2. immagini_varianti: utilizza il campo "url"
 * 3. prodotti: utilizza il campo "immagine_url"
 * 
 * Il codice seguente gestisce queste inconsistenze nei vari punti:
 * - Quando accede alla tabella specifica (come prodotti), utilizza il nome di campo corretto
 * - Quando deve gestire oggetti immagine di origine incerta, utilizza una fallback syntax: 
 *   img.immagine_url || img.url
 * 
 * Si è deciso di mantenere questa soluzione per compatibilità invece di modificare
 * la struttura del database, poiché i tentativi precedenti di standardizzazione 
 * hanno creato problemi di funzionalità.
 */

// Cache delle immagini per prodotto
const immaginiCache: Record<number, { data: any[], defaultImage: string | null }> = {};
// Cache delle configurazioni già richieste
const configurazioniCache: Record<string, string | null> = {};
// Cache delle immagini già precaricate (per rendering immediato)
const preloadedImagesCache: Record<string, HTMLImageElement> = {};

/**
 * Ottimizzazione performante per recuperare l'immagine di un prodotto
 * con una specifica configurazione
 */
export const getImmagineProdottoDinamicaOptimized = async (
  prodottoId: number,
  configurazione: Record<string, string>
): Promise<string | null> => {
  try {
    // Creiamo una chiave di cache basata sul prodottoId e configurazione
    const configStr = JSON.stringify(configurazione);
    const cacheKey = `${prodottoId}:${configStr}`;
    
    // Verifica se questa esatta configurazione è già in cache
    if (configurazioniCache[cacheKey] !== undefined) {
      // Assicuriamoci che l'immagine sia precaricata per rendering immediato
      if (configurazioniCache[cacheKey]) {
        // Non attendiamo il completamento di questa Promise per non bloccare il rendering
        preloadImage(configurazioniCache[cacheKey]).catch((err) => {
          // Gestione dell'errore più esplicita che mantiene l'app funzionante
          imageLogger.debug(`Errore non critico durante il precaricamento dell'immagine: ${err.message}`);
        });
      }
      return configurazioniCache[cacheKey];
    }
    
    // Verifica se abbiamo già recuperato le immagini per questo prodotto
    if (!immaginiCache[prodottoId]) {
      // Recupera tutte le immagini del prodotto
      const { data: immagini, error } = await supabase
        .from("immagini_prodotti_dinamiche")
        .select("*")
        .eq("prodotto_id", prodottoId);

      if (error) {
        imageLogger.error("Errore fetch immagini_prodotti_dinamiche:", error);
      }
      
      // Fallback all'immagine default del prodotto se necessario
      let defaultImage = null;
      if (!immagini || immagini.length === 0) {
        const { data: prodotto } = await supabase
          .from("prodotti")
          .select("immagine_url")
          .eq("id", prodottoId)
          .single();
        
        defaultImage = prodotto?.immagine_url || null;
      }
      
      // Memorizza in cache
      immaginiCache[prodottoId] = {
        data: immagini || [],
        defaultImage
      };
    }
    
    // Recupera i dati dalla cache
    const { data: immagini, defaultImage } = immaginiCache[prodottoId];
    
    // Se non ci sono immagini, usa il fallback
    if (immagini.length === 0) {
      configurazioniCache[cacheKey] = defaultImage;
      // Precarica l'immagine se esiste
      if (defaultImage) {
        preloadImage(defaultImage).catch((err) => {
          imageLogger.debug(`Errore non critico durante il precaricamento dell'immagine default: ${err.message}`);
        });
      }
      return defaultImage;
    }
    
    // Cerca corrispondenza tra le immagini
    for (const immagine of immagini) {
      const configImmagine = immagine.configurazione || {};
      
      if (compareConfigurations(configImmagine, configurazione)) {
        // NOTA: Qui usiamo "immagine_url" perché accediamo a dati dalla tabella "immagini_prodotti_dinamiche"
        // che utilizza questo nome di campo specifico
        const imageSrc = immagine.immagine_url;
        if (imageSrc) {
          // Memorizza in cache e restituisci
          configurazioniCache[cacheKey] = imageSrc;
          // Precarica l'immagine per rendering immediato
          preloadImage(imageSrc).catch((err) => {
            imageLogger.debug(`Errore non critico durante il precaricamento dell'immagine configurata: ${err.message}`);
          });
          return imageSrc;
        }
      }
    }
    
    // Se non c'è corrispondenza esatta, cerchiamo un'immagine di default
    const immagineDefault = immagini.find(img => img.default === true);
    if (immagineDefault) {
      // NOTA: Qui (e in alcuni punti successivi) usiamo il campo "url" invece di "immagine_url"
      // per mantenere la compatibilità con il codice originale. 
      // Il database presenta questa inconsistenza tra le tabelle.
      const result = immagineDefault.url;
      if (result) {
        configurazioniCache[cacheKey] = result;
        // Precarica l'immagine per rendering immediato
        preloadImage(result).catch(() => {});
        return result;
      }
    }
    
    // Se non troviamo nulla, prendiamo la prima immagine
    if (immagini[0]) {
      // NOTA: Anche qui utilizziamo "url" per compatibilità con l'implementazione originale
      const result = immagini[0].url;
      if (result) {
        configurazioniCache[cacheKey] = result;
        // Precarica l'immagine per rendering immediato
        preloadImage(result).catch(() => {});
        return result;
      }
    }
    
    // Ultimo fallback all'immagine del prodotto
    configurazioniCache[cacheKey] = defaultImage;
    // Precarica l'immagine se esiste
    if (defaultImage) {
      preloadImage(defaultImage).catch(() => {});
    }
    return defaultImage;
  } catch (error) {
    imageLogger.error("Errore nel recupero dell'immagine dinamica:", error);
    return null;
  }
};

/**
 * Funzione utility per precaricare fisicamente le immagini nel browser
 * Questa funzione ritorna una Promise che si risolve quando l'immagine è caricata
 * 
 * OTTIMIZZAZIONE: Gestione integrata degli errori per evitare catch vuoti in più punti
 * Questa funzione cattura e registra gli errori internamente, ma propaga anche la Promise
 * originale per permettere gestioni personalizzate dove necessario
 */
const preloadImage = (url: string): Promise<HTMLImageElement> => {
  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    // Se l'immagine è già nella cache, ritornala immediatamente
    if (preloadedImagesCache[url]) {
      resolve(preloadedImagesCache[url]);
      return;
    }
    
    // Altrimenti crea una nuova immagine
    const img = new Image();
    img.onload = () => {
      preloadedImagesCache[url] = img;
      resolve(img);
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
  
  // Aggiungiamo un handler di errore di default che logga ma non blocca l'esecuzione
  // Questo ci permette di tenere traccia degli errori senza dover aggiungere .catch() ovunque
  imagePromise.catch(err => {
    imageLogger.debug(`Errore non critico durante il precaricamento dell'immagine ${url}: ${err?.message || 'Errore sconosciuto'}`);
  });
  
  // Restituiamo la Promise originale per consentire ulteriori gestioni customizzate
  return imagePromise;
};

/**
 * Precarica le immagini per più prodotti in anticipo con ottimizzazione avanzata
 * per un rendering istantaneo delle immagini e gestione errori migliorata
 * 
 * @param prodottiIds Array di ID prodotto da precaricare
 * @returns Promise vuota che si risolve al completamento dell'operazione
 */
export const precaricaImmaginiProdotti = async (prodottiIds: number[]): Promise<void> => {
  if (!prodottiIds || prodottiIds.length === 0) {
    imageLogger.debug("Nessun prodotto da precaricare");
    return;
  }

  try {
    // Filtra solo i prodotti che non sono già in cache
    const idsToLoad = prodottiIds.filter(id => !immaginiCache[id]);
    
    if (idsToLoad.length === 0) {
      imageLogger.debug("Tutte le immagini richieste sono già in cache");
      return;
    }
    
    // Traccia l'inizio dell'operazione
    imageLogger.info(`Avvio precaricamento immagini per ${idsToLoad.length} prodotti`);
    
    // Carica le immagini per tutti i prodotti in un'unica chiamata
    const { data: immagini, error } = await supabase
      .from("immagini_prodotti_dinamiche")
      .select("*")
      .in("prodotto_id", idsToLoad);
      
    if (error) {
      // Log errore dettagliato con informazioni contestuali
      imageLogger.error(
        `Errore Supabase nel precaricamento delle immagini per ${idsToLoad.length} prodotti:`, 
        { error, codice: error.code, messaggio: error.message, prodottiIds: idsToLoad }
      );
      return;
    }
    
    if (!immagini || immagini.length === 0) {
      imageLogger.warn(`Nessuna immagine dinamica trovata per i prodotti: ${idsToLoad.join(', ')}`);
      // Continuiamo comunque per caricare almeno le immagini default
    }
    
    // Raggruppa le immagini per prodotto
    const immaginiPerProdotto: Record<number, any[]> = {};
    immagini?.forEach(img => {
      if (!immaginiPerProdotto[img.prodotto_id]) {
        immaginiPerProdotto[img.prodotto_id] = [];
      }
      immaginiPerProdotto[img.prodotto_id].push(img);
    });
    
    // Carica le immagini default per i prodotti che non hanno immagini dinamiche
    const prodottiSenzaImmagini = idsToLoad.filter(id => !immaginiPerProdotto[id] || immaginiPerProdotto[id].length === 0);
    
    // Statistiche per logging
    const prodottiConImmaginiDinamiche = idsToLoad.length - prodottiSenzaImmagini.length;
    if (prodottiConImmaginiDinamiche > 0) {
      imageLogger.debug(`Trovate immagini dinamiche per ${prodottiConImmaginiDinamiche}/${idsToLoad.length} prodotti`);
    }
    
    // Variabile per salvare i dati dei prodotti senza immagini dinamiche
    let prodottiDefault: Array<{id: number, immagine_url: string}> = [];
    
    if (prodottiSenzaImmagini.length > 0) {
      imageLogger.debug(`Caricamento immagini default per ${prodottiSenzaImmagini.length} prodotti senza immagini dinamiche`);
      
      const { data, error: prodottiError } = await supabase
        .from("prodotti")
        .select("id, immagine_url")
        .in("id", prodottiSenzaImmagini);
        
      if (prodottiError) {
        imageLogger.error(
          `Errore nel caricamento delle immagini default per ${prodottiSenzaImmagini.length} prodotti:`, 
          { error: prodottiError, codice: prodottiError.code, messaggio: prodottiError.message }
        );
      }
      
      // Salva i dati per un uso successivo
      prodottiDefault = data || [];
      
      if (prodottiDefault.length < prodottiSenzaImmagini.length) {
        imageLogger.warn(
          `Trovate solo ${prodottiDefault.length}/${prodottiSenzaImmagini.length} immagini default per i prodotti`
        );
      }
      
      // Memorizza le immagini default
      prodottiDefault.forEach(prodotto => {
        immaginiCache[prodotto.id] = {
          data: [],
          defaultImage: prodotto.immagine_url
        };
      });
    }
    
    // Memorizza tutte le immagini nella cache
    Object.entries(immaginiPerProdotto).forEach(([prodottoId, imgs]) => {
      immaginiCache[Number(prodottoId)] = {
        data: imgs,
        defaultImage: null // Sarà caricato on-demand se necessario
      };
    });
    
    // OTTIMIZZAZIONE AVANZATA: Precarichiamo fisicamente tutte le immagini nel browser
    // Questo permette un rendering istantaneo delle immagini quando necessario
    const preloadPromises: Promise<HTMLImageElement>[] = [];
    let urlCount = 0;
    
    // Immagini di configurazioni specifiche
    immagini?.forEach(img => {
      // NOTA: Qui utilizziamo un operatore OR per gestire l'inconsistenza dei campi nelle tabelle.
      // Alcune tabelle usano "immagine_url" mentre altre usano "url"
      const url = img.immagine_url || img.url;
      if (url) {
        preloadPromises.push(preloadImage(url));
        urlCount++;
      }
    });
    
    // Immagini default per i prodotti senza immagini specifiche
    prodottiDefault.forEach(prodotto => {
      if (prodotto.immagine_url) {
        preloadPromises.push(preloadImage(prodotto.immagine_url));
        urlCount++;
      }
    });
    
    if (preloadPromises.length === 0) {
      imageLogger.warn(`Nessuna immagine valida trovata per il precaricamento di ${idsToLoad.length} prodotti`);
      return;
    }
    
    imageLogger.debug(`Avvio precaricamento fisico di ${urlCount} immagini nel browser`);
    
    // Esegui tutte le promesse di precaricamento in parallelo e monitora i risultati
    const results = await Promise.allSettled(preloadPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    if (failed > 0) {
      imageLogger.warn(`Precaricamento immagini completato: ${successful} successi, ${failed} fallimenti`);
    } else {
      imageLogger.info(`Precaricamento di ${successful} immagini completato con successo`);
    }
  } catch (error: any) {
    // Gestione più dettagliata dell'errore con più informazioni di contesto
    const errorMessage = error?.message || 'Errore sconosciuto';
    imageLogger.error(
      `Errore critico nel precaricamento delle immagini: ${errorMessage}`,
      { 
        numProdotti: prodottiIds.length, 
        stack: error?.stack,
        name: error?.name
      }
    );
  }
};