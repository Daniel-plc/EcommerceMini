/**
 * Utilities per l'applicazione
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Caratteristica } from "./model";

/**
 * Utility per combinare classi condizionalmente
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Funzione per creare una versione debounced di una funzione
 * Ritarda l'esecuzione finché non passa il delay specificato senza ulteriori chiamate
 * Molto utile per input, ricerche e altre funzioni chiamate frequentemente
 * 
 * @param func La funzione da eseguire con debounce
 * @param delay Il tempo di attesa in millisecondi
 * @returns Versione debounced della funzione originale
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return function(...args: Parameters<T>): void {
    // Cancella il timeout precedente se esiste
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Imposta un nuovo timeout
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * Formatta il primo carattere di una stringa in maiuscolo
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Normalizza un valore stringa per confronti coerenti.
 * Rende il testo lowercase, rimuove spazi e lo trimma.
 * @param str La stringa da normalizzare
 * @returns Stringa normalizzata
 */
export function normalizzaValore(val: string) {
    return val.toLowerCase().replace(/\s+/g, "");
  }

/**
 * Cache per salvare l'ordine e l'ID delle caratteristiche per prodotto
 * Struttura: { prodottoId: { chiave_configurazione: { ordine, id } } }
 */
interface CaratteristicaInfo {
  ordine: number;
  id: number;
}
const cacheOrdineCaratteristiche: Record<number, Record<string, CaratteristicaInfo>> = {};

/**
 * Imposta l'ordine delle caratteristiche per un prodotto specifico
 * @param prodottoId ID del prodotto
 * @param caratteristiche Array di caratteristiche con ordine
 */
export function setOrdineCaratteristiche(prodottoId: number, caratteristiche: Caratteristica[]): void {
  if (!cacheOrdineCaratteristiche[prodottoId]) {
    cacheOrdineCaratteristiche[prodottoId] = {};
  }
  
  // Popola la cache con l'ordine e l'ID per ogni chiave di configurazione
  caratteristiche.forEach(car => {
    cacheOrdineCaratteristiche[prodottoId][car.chiave_configurazione.toLowerCase()] = {
      ordine: car.ordine,
      id: car.caratteristica_id || 0
    };
  });
}

/**
 * Formatta una configurazione di prodotto in una stringa leggibile
 * con un ordine consistente delle proprietà
 * @param config Oggetto configurazione con chiavi e valori
 * @param prodottoId ID del prodotto (opzionale) per usare l'ordine specifico
 * @returns Array di stringhe con le caratteristiche formattate in ordine corretto
 */
export function formatConfigurazione(config: Record<string, string>, prodottoId?: number): string[] {
  // Ordine prestabilito delle chiavi come fallback
  const ordineChiaviDefault = ["tipologia", "formato", "confezione"];
  
  // Filtra e ordina le chiavi di configurazione
  const chiavi = Object.keys(config).sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    
    // Se abbiamo un prodottoId e la cache contiene questo prodotto, usiamo quell'ordine
    if (prodottoId && cacheOrdineCaratteristiche[prodottoId]) {
      const infoA = cacheOrdineCaratteristiche[prodottoId][aLower];
      const infoB = cacheOrdineCaratteristiche[prodottoId][bLower];
      
      // Se entrambe le chiavi hanno un ordine definito, utilizziamo quello
      if (infoA !== undefined && infoB !== undefined) {
        // Prima confronta per ordine
        if (infoA.ordine !== infoB.ordine) {
          return infoA.ordine - infoB.ordine;
        }
        
        // Se l'ordine è lo stesso, usa l'ID caratteristica come criterio secondario
        return infoA.id - infoB.id;
      }
      
      // Se solo una ha un ordine definito, quella ha precedenza
      if (infoA !== undefined) return -1;
      if (infoB !== undefined) return 1;
    }
    
    // Fallback all'ordine predefinito se non abbiamo informazioni specifiche
    const indexA = ordineChiaviDefault.indexOf(aLower);
    const indexB = ordineChiaviDefault.indexOf(bLower);
    
    // Se entrambe le chiavi sono nell'ordine default, ordina secondo l'ordine
    if (indexA >= 0 && indexB >= 0) return indexA - indexB;
    
    // Se solo una chiave è nell'ordine default, quella ha precedenza
    if (indexA >= 0) return -1;
    if (indexB >= 0) return 1;
    
    // Ordine alfabetico per le chiavi non specificate
    return a.localeCompare(b);
  });
  
  // Crea l'array formattato con le chiavi nell'ordine corretto
  return chiavi.map(chiave => `${capitalize(chiave)}: ${config[chiave]}`);
}

/**
 * Normalizza le chiavi di configurazione di un prodotto (tutte minuscole)
 * Funzione helper centralizzata per evitare duplicazione di codice in tutta l'app
 * @param configurazione Configurazione del prodotto da normalizzare
 * @returns Nuova configurazione con chiavi normalizzate
 */
export function normalizzaChiaviConfigurazione(configurazione: Record<string, string>): Record<string, string> {
  if (!configurazione) return {};
  
  const configNormalizzata: Record<string, string> = {};
  
  // Per ogni chiave nella configurazione, normalizzala in minuscolo
  Object.keys(configurazione).forEach(chiave => {
    const chiaveNormalizzata = chiave.toLowerCase();
    configNormalizzata[chiaveNormalizzata] = configurazione[chiave];
  });
  
  return configNormalizzata;
}

/**
 * Crea una chiave univoca per una configurazione di prodotto
 * Utile per confrontare o identificare configurazioni in cache
 * @param prodottoId ID del prodotto
 * @param configurazione Configurazione del prodotto
 * @returns Stringa univoca che rappresenta questa configurazione
 */
export function creaChiaveConfigurazione(prodottoId: number, configurazione: Record<string, string>): string {
  // Normalizza prima le chiavi
  const configNormalizzata = normalizzaChiaviConfigurazione(configurazione);
  
  // Ordina le chiavi per garantire coerenza
  const chiavi = Object.keys(configNormalizzata).sort();
  
  // Crea una rappresentazione stringa della configurazione ordinata
  const configStringa = chiavi.map(k => `${k}:${configNormalizzata[k]}`).join('|');
  
  // Restituisci una chiave univoca nel formato prodottoId-configurazioneOrdinata
  return `${prodottoId}-${configStringa}`;
}

/**
 * Confronta due oggetti configurazione per determinare se sono identici
 * @param config1 Prima configurazione
 * @param config2 Seconda configurazione
 * @returns true se le configurazioni sono identiche, false altrimenti
 */

export function compareConfigurations(
  config1: Record<string, string>,
  config2: Record<string, string>
): boolean {

  // 1) Normalizziamo chiavi/valori di entrambi i config
  const norm1 = Object.fromEntries(
    Object.entries(config1).map(([k, v]) => [
      normalizzaValore(k),
      normalizzaValore(v),
    ])
  );
  const norm2 = Object.fromEntries(
    Object.entries(config2).map(([k, v]) => [
      normalizzaValore(k),
      normalizzaValore(v),
    ])
  );

  // 2) Confronto delle chiavi
  const keys1 = Object.keys(norm1).sort();
  const keys2 = Object.keys(norm2).sort();

  if (keys1.length !== keys2.length) {
    return false;
  }

  // 3) Confronto dei valori
  for (let i = 0; i < keys1.length; i++) {
    if (keys1[i] !== keys2[i]) {
      return false;
    }
    if (norm1[keys1[i]] !== norm2[keys1[i]]) {
      return false;
    }
  }

  return true;
}

/**
 * Estrae e normalizza le caratteristiche visibili da un oggetto prodotto
 * @param p Oggetto prodotto grezzo da Supabase
 * @returns Array di caratteristiche normalizzate
 */
export function normalizzaCaratteristiche(p: any) {
  return (p.prodotti_caratteristiche || [])
    .filter((pc: any) => pc.visibile !== false)
    .map((pc: any) => {
      const car = pc.caratteristiche || {};
      return {
        id: pc.id,
        prodotto_id: p.id,
        caratteristica_id: car.id,
        nome: car.nome_label || car.nome || '',
        obbligatoria: pc.obbligatoria || false,
        ordine: pc.ordine || 0,
        chiave_configurazione: (car.nome || '').toLowerCase().trim(),
      };
    })
    .sort((a: any, b: any) => {
      // Prima ordina per il campo ordine
      if (a.ordine !== b.ordine) {
        return a.ordine - b.ordine;
      }
      // Se l'ordine è uguale, usa caratteristica_id come criterio secondario
      return a.caratteristica_id - b.caratteristica_id;
    });
}

/**
 * Estrae e normalizza i valori visibili da un oggetto prodotto
 * @param p Oggetto prodotto grezzo da Supabase
 * @returns Array di valori normalizzati
 */
export function normalizzaValori(p: any) {
  return (p.prodotti_valori_caratteristiche || [])
    .filter((v: any) => v.visibile !== false)
    .map((v: any) => ({
      id: v.valori_caratteristiche?.id || 0,
      caratteristica_id: v.valori_caratteristiche?.caratteristica_id || 0,
      valore: v.valori_caratteristiche?.valore || '',
      descrizione: v.valori_caratteristiche?.descrizione || '',
      ordine: v.valori_caratteristiche?.ordine || 0,
      visibile: true,
    }))
    .sort((a: any, b: any) => {
      // Prima ordina per il campo ordine
      if (a.ordine !== b.ordine) {
        return a.ordine - b.ordine;
      }
      // Se l'ordine è uguale, usa id come criterio secondario
      return a.id - b.id;
    });
}
