export interface CombinazioneValida {
  id: number;
  configurazione: Record<string, string>;
  codice?: string;
}

export interface ProdottoDinamico {
  id: number;
  nome: string;
  descrizione: string;
  immagine_url: string;
  max_righe_card?: number;
  caratteristiche: Caratteristica[];
  valori_caratteristiche: ValoreCaratteristica[];
  combinazioni_valide?: CombinazioneValida[];
}

export interface Caratteristica {
  id: number;
  prodotto_id?: number;
  caratteristica_id?: number; 
  nome: string;               
  nome_label?: string;        
  obbligatoria: boolean;
  ordine: number;
  chiave_configurazione: string; 
}

export interface ValoreCaratteristica {
  id: number;
  caratteristica_id: number;
  valore: string;
  descrizione?: string;
  ordine: number;
  visibile: boolean;
}

export interface ImmagineProdottoDinamica {
  id: number;
  prodotto_id: number;
  url: string;
  configurazione: Record<string, string>;
  default: boolean;
  codice_prodotto?: string;
}

export type CartItem = {
  product: {
    id: number;
    nome: string;
    descrizione: string;
    immagine_url: string;
  };
  immagine_url: string;
  quantity: number;
  configurazione: Record<string, string>;
};

// Definizione della struttura per le righe dell'ordine
export interface RigaOrdine {
  nome_prodotto: string;
  configurazione: Record<string, string>;
  immagine_url: string;
  quantità: number; // Campo unificato per la quantità (con accento)
  prodotto_id?: number; // ID del prodotto associato per l'ordinamento delle proprietà
  checked?: boolean; // Flag opzionale per indicare se la riga è stata spuntata
}

// Definizione dell'ordine con le righe come array JSON
export interface StoricoOrdine {
  id: number;
  data_ordine: string;
  stato: string;
  utente_id: string;
  righe: RigaOrdine[];
  n_ordine?: number; // Nuovo campo progressivo per utente (nome esatto dalla tabella Supabase)
}
