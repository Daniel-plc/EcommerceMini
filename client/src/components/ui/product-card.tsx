import { memo, useState } from "react";
import { ProdottoDinamico } from "@/lib/model";
import { CodiceProdotto } from "@/components/ui/codice-prodotto";
import { formatConfigurazione, normalizzaValore } from "@/lib/utils";

/**
 * Props per il componente ProductCard
 */
interface ProductCardProps {
  prodotto: ProdottoDinamico;
  scelte: Record<string, string>;
  quantita: number;
  immagine: string;
  onImageClick: () => void;
  onQuantityChange: (delta: number) => void;
  onQuantityInput: (value: string) => void;
  onConfigChange: (caratteristicaKey: string, valore: string) => void;
  onAddToCart: () => void;
  getValoriDisponibili: (caratteristicaKey: string) => any[];
  isSelezionabile: (chiaveConfig: string) => boolean;
  getPrecedente: (chiaveConfig: string) => string;
  isDinamicallyRequired?: (chiaveConfig: string) => boolean;
}

/**
 * Componente base per la card del prodotto
 * Implementazione non memorizzata per visualizzazione standard senza ricerca
 */
const ProductCardBase = ({
  prodotto,
  scelte,
  quantita,
  immagine,
  onImageClick,
  onQuantityChange,
  onQuantityInput,
  onConfigChange,
  onAddToCart,
  getValoriDisponibili,
  isSelezionabile,
  getPrecedente,
  isDinamicallyRequired
}: ProductCardProps) => {
  // Stato locale per mostrare/nascondere la descrizione completa
  const [mostraDescrizione, setMostraDescrizione] = useState(false);

  // Determina se abbiamo scelto tutte le caratteristiche obbligatorie 
  // (sia quelle marcate staticamente che quelle diventate obbligatorie dinamicamente)
  const tutteObbligatorieScelte = prodotto.caratteristiche
    .filter(c => {
      const chiave = c.chiave_configurazione.toLowerCase();
      return c.obbligatoria || (isDinamicallyRequired ? isDinamicallyRequired(chiave) : false);
    })
    .every(c => {
      const chiave = c.chiave_configurazione.toLowerCase();
      return scelte[chiave] && scelte[chiave].trim() !== "";
    });

  // Calcola se la card ha troppe caratteristiche da mostrare completamente
  const tooManyRows = prodotto.caratteristiche.length > (prodotto.max_righe_card || 3);

  // Formatta la configurazione corrente per la visualizzazione
  const configurazione = Object.fromEntries(
    Object.entries(scelte || {}).map(([k, v]) => [k.toLowerCase(), v?.toLowerCase() || ''])
  );

  return (
    <div className="product-card">
      <div className="product-card-wrapper">
        {/* Sezione immagine */}
        <div className="product-card-image-section">
          <img
            src={immagine || prodotto.immagine_url}
            alt={prodotto.nome}
            className="product-card-image"
            onClick={onImageClick}
          />
          
          {/* Codice prodotto */}
          <CodiceProdotto
            prodottoId={prodotto.id}
            configurazione={configurazione}
            className="absolute left-2 top-2"
          />
          
          <div 
            className="product-card-zoom" 
            onClick={(e) => {
              e.stopPropagation();
              onImageClick();
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
          
          {/* Descrizione con toggle per mostrare/nascondere */}
          <div className="product-card-description-container">
            <p className={`product-card-description ${!mostraDescrizione && 'line-clamp-2'}`}>
              {prodotto.descrizione}
            </p>
            {prodotto.descrizione && prodotto.descrizione.length > 120 && (
              <button 
                onClick={() => setMostraDescrizione(!mostraDescrizione)}
                className="text-xs text-primary hover:underline mt-1 ml-auto block"
              >
                {mostraDescrizione ? "Mostra meno" : "Leggi tutto"}
              </button>
            )}
          </div>
          
          {/* Caratteristiche con visualizzazione condizionale */}
          <div className={`product-options ${tooManyRows && !mostraDescrizione ? 'max-h-[240px] overflow-y-auto pr-1' : ''} flex-grow`}>
            {prodotto.caratteristiche.map((car) => {
              const chiaveNorm = car.chiave_configurazione.toLowerCase().trim();
              const valoriDisponibili = getValoriDisponibili(chiaveNorm);
              const valoreSelezionato = scelte[chiaveNorm] || "";
              // Verifica se è obbligatoria staticamente o dinamicamente
              const obbligatoriaOra = car.obbligatoria || 
                (isDinamicallyRequired ? isDinamicallyRequired(chiaveNorm) : false);
              
              return (
                <div key={car.id} className="product-option">
                  <div className="product-option-row">
                    <label className="product-option-label">
                      {car.nome}
                      {obbligatoriaOra && (
                        <span className="product-option-required">*</span>
                      )}
                    </label>
                    <span className="product-option-count">
                      {valoriDisponibili.length} opz.
                    </span>
                  </div>
                  {/* Determina se questo menu è selezionabile e il suo messaggio */}
                  {(() => {
                    const selezionabile = isSelezionabile(chiaveNorm);
                    const placeholder = selezionabile
                      ? "-- Seleziona --"
                      : `-- Prima seleziona ${getPrecedente(chiaveNorm)} --`;
                    
                    return (
                      <select
                        value={valoreSelezionato}
                        onChange={(e) => onConfigChange(chiaveNorm, e.target.value)}
                        className="product-option-select"
                        aria-label={`Seleziona ${car.nome}`}
                        disabled={!selezionabile}
                      >
                        <option value="">{placeholder}</option>
                        {valoriDisponibili.map((v) => (
                          <option key={v.id} value={normalizzaValore(v.valore)}>
                            {v.valore}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
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

          {/* Sezione controlli */}
          <div className="product-card-footer">
            {/* Label quantità */}
            <div className="qty-label">Quantità:</div>
            
            {/* Griglia controlli */}
            <div className="cart-controls-grid">
              {/* Controlli quantità */}
              <div className="qty-control-container">
                <div className="qty-stepper">
                  <button
                    onClick={() => onQuantityChange(-1)}
                    className="qty-btn"
                    aria-label="Diminuisci quantità"
                  >
                    <span className="inline-flex h-full w-full items-center justify-center">−</span>
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={quantita === 0 ? "" : quantita}
                    onChange={(e) => onQuantityInput(e.target.value)}
                    className="qty-input"
                    aria-label="Quantità"
                  />
                  <button
                    onClick={() => onQuantityChange(1)}
                    className="qty-btn"
                    aria-label="Aumenta quantità"
                  >
                    <span className="inline-flex h-full w-full items-center justify-center">+</span>
                  </button>
                </div>
              </div>
              
              {/* Pulsante aggiungi */}
              <div className="add-btn-container">
                <button
                  onClick={onAddToCart}
                  className={`cart-add-btn ${!tutteObbligatorieScelte ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Aggiungi all'ordine"
                  disabled={!tutteObbligatorieScelte}
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
            
            {/* Messaggio per le opzioni obbligatorie - appare solo se ci sono opzioni con asterisco */}
            {prodotto.caratteristiche.some(c => 
              c.obbligatoria || (isDinamicallyRequired ? isDinamicallyRequired(c.chiave_configurazione.toLowerCase()) : false)
            ) && (
              <div className="options-required-warning">
                Seleziona tutte le opzioni obbligatorie
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Versione memorizzata del ProductCard che ottimizza le prestazioni
 * riducendo i re-render inutili quando le props non cambiano.
 */
export const ProductCard = memo(ProductCardBase);

/**
 * Props per il componente ResultCard
 */
interface ResultCardProps {
  risultato: {
    codice: string;
    prodotto_id: number;
    configurazione: Record<string, string>;
    immagine_url: string;
    prodotto: ProdottoDinamico | null;
  };
  quantita: number;
  onQuantityChange: (delta: number) => void;
  onQuantityInput: (value: string) => void;
  onAddToCart: () => void;
  onImageClick: () => void;
}

/**
 * Componente base per la card dei risultati di ricerca
 * Implementazione non memorizzata
 */
const ResultCardBase = ({
  risultato,
  quantita,
  onQuantityChange,
  onQuantityInput,
  onAddToCart,
  onImageClick
}: ResultCardProps) => {
  const prodotto = risultato.prodotto;
  if (!prodotto) return null;
  
  // Formatta la configurazione per la visualizzazione
  const configurazione = risultato.configurazione || {};
  const configFormatted = formatConfigurazione(configurazione, prodotto.id);
  
  return (
    <div className="product-card">
      <div className="product-card-wrapper">
        {/* Sezione immagine */}
        <div className="product-card-image-section">
          <img
            src={risultato.immagine_url || prodotto.immagine_url}
            alt={prodotto.nome}
            className="product-card-image"
            onClick={onImageClick}
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
              onImageClick();
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
          
          {/* Caratteristiche come elenco di sola lettura */}
          <div className="product-options flex-grow">
            {prodotto.caratteristiche.length > 0 ? (
              <div className="result-config-list">
                <h3 className="text-sm font-medium mb-2">Configurazione:</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {configFormatted.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="py-3 text-center text-sm text-slate-500">
                Questo prodotto non ha opzioni configurabili.
              </div>
            )}
          </div>

          {/* Sezione controlli */}
          <div className="product-card-footer">
            {/* Label quantità */}
            <div className="qty-label">Quantità:</div>
            
            {/* Sistema a griglia per controlli */}
            <div className="cart-controls-grid quantity-controls">
              {/* Controlli quantità */}
              <div className="qty-control-container">
                <div className="qty-stepper">
                  <button
                    onClick={() => onQuantityChange(-1)}
                    className="qty-btn"
                    aria-label="Diminuisci quantità"
                  >
                    <span className="inline-flex h-full w-full items-center justify-center">−</span>
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={quantita === 0 ? "" : quantita}
                    onChange={(e) => onQuantityInput(e.target.value)}
                    className="qty-input"
                    aria-label="Quantità"
                  />
                  <button
                    onClick={() => onQuantityChange(1)}
                    className="qty-btn"
                    aria-label="Aumenta quantità"
                  >
                    <span className="inline-flex h-full w-full items-center justify-center">+</span>
                  </button>
                </div>
              </div>
              
              {/* Pulsante aggiungi */}
              <div className="add-btn-container">
                <button
                  onClick={onAddToCart}
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
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Versione memorizzata del ResultCard che ottimizza le prestazioni
 * riducendo i re-render inutili.
 */
export const ResultCard = memo(ResultCardBase);