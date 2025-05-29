import { compareConfigurations } from './utils';
import { CartItem } from './model';

// Ottieni l'URL di Supabase dalle variabili d'ambiente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const USER_CACHE_KEY = "sb_session";

// Costanti per le chiavi del carrello
export const CART_KEY_PREFIX = "cart_";
export const GUEST_CART_KEY = `${CART_KEY_PREFIX}guest`;

/**
 * Ottiene la chiave di localStorage per il carrello dell'utente corrente
 * @returns La chiave del carrello per l'utente attuale o 'cart_guest' se non autenticato
 */
export const getCartKey = (): string => {
  // Recupera l'ID utente dalla sessione temporanea (unica supportata)
  let userId = 'guest';
  
  // Controlla la sessione temporanea in sessionStorage
  const tempSession = sessionStorage.getItem(USER_CACHE_KEY);
  if (tempSession) {
    try {
      const tempSessionData = JSON.parse(tempSession);
      if (tempSessionData.user?.id) {
        userId = tempSessionData.user.id;
        return `${CART_KEY_PREFIX}${userId}`;
      }
    } catch (e) {
      // Gestione silenziosa degli errori, non è necessario loggare
      // Se c'è un errore, userà il carrello guest come fallback
    }
  }
  
  return `${CART_KEY_PREFIX}${userId}`;
};

/**
 * Migra il carrello guest all'utente specifico quando avviene un login
 * @param userId ID dell'utente a cui migrare il carrello guest
 */
export const migrateGuestCart = (userId: string): void => {
  const userCartKey = `${CART_KEY_PREFIX}${userId}`;
  
  // Se l'utente ha già un carrello, non migrare
  if (localStorage.getItem(userCartKey)) {
    return;
  }
  
  // Ottieni il carrello guest
  const guestCart = localStorage.getItem(GUEST_CART_KEY);
  if (guestCart) {
    // Copia nel carrello dell'utente
    localStorage.setItem(userCartKey, guestCart);
    // Rimuovi il carrello guest
    localStorage.removeItem(GUEST_CART_KEY);
    // Notifica una sola volta gli altri componenti del cambiamento
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey: userCartKey } }));
  }
};

/**
 * Migra il vecchio carrello con chiave 'cart' al nuovo formato
 * Questa funzione controlla solo una volta per sessione per migliorare le prestazioni
 */
export const migrateLegacyCart = (() => {
  // Flag per tracciare se la migrazione è già stata eseguita in questa sessione
  let migrationChecked = false;
  
  return (): void => {
    // Se abbiamo già verificato in questa sessione, non ricontrollare
    if (migrationChecked) return;
    
    const legacyCart = localStorage.getItem('cart');
    if (legacyCart) {
      const cartKey = getCartKey();
      localStorage.setItem(cartKey, legacyCart);
      localStorage.removeItem('cart');
      
      // Notifica gli altri componenti del cambiamento
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey } }));
    }
    
    // Segna che la migrazione è stata verificata
    migrationChecked = true;
  };
})();

/**
 * Aggiunge un prodotto al carrello dell'utente corrente
 * @param item Prodotto da aggiungere al carrello
 * @returns Lista aggiornata dei prodotti nel carrello
 */
export const addToCart = (item: CartItem) => {
  // Migra il vecchio carrello se esiste
  migrateLegacyCart();
  
  const cartKey = getCartKey();
  const currentCart = JSON.parse(localStorage.getItem(cartKey) || '[]') as CartItem[];

  // Controlla se esiste già un prodotto con la stessa configurazione
  const existingItemIndex = currentCart.findIndex(cartItem => {
    // Confronta l'ID del prodotto
    if (cartItem.product.id !== item.product.id) {
      return false;
    }

    // Utilizza la funzione di utilità per confrontare le configurazioni
    return compareConfigurations(cartItem.configurazione, item.configurazione);
  });

  if (existingItemIndex >= 0) {
    currentCart[existingItemIndex].quantity += item.quantity;
  } else {
    currentCart.push(item);
  }

  localStorage.setItem(cartKey, JSON.stringify(currentCart));

  // Dispatch a custom event to notify other components (like the Navbar)
  // Include l'ID utente nella chiave dell'evento per supportare diversi carrelli
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey } }));

  return currentCart;
};

/**
 * Ottiene la lista dei prodotti nel carrello dell'utente corrente
 * @returns Lista dei prodotti nel carrello
 */
export const getCartItems = (): CartItem[] => {
  // Migra il vecchio carrello se esiste
  migrateLegacyCart();
  
  const cartKey = getCartKey();
  return JSON.parse(localStorage.getItem(cartKey) || '[]');
};

/**
 * Rimuove un prodotto dal carrello
 * @param index Indice del prodotto da rimuovere
 * @returns Lista aggiornata dei prodotti nel carrello
 */
export const removeFromCart = (index: number) => {
  const currentCart = getCartItems();
  currentCart.splice(index, 1);
  
  const cartKey = getCartKey();
  localStorage.setItem(cartKey, JSON.stringify(currentCart));

  // Dispatch a custom event to notify other components
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey } }));

  return currentCart;
};

/**
 * Aggiorna la quantità di un prodotto nel carrello
 * @param index Indice del prodotto da aggiornare
 * @param quantity Nuova quantità
 * @returns Lista aggiornata dei prodotti nel carrello
 */
export const updateCartItemQuantity = (index: number, quantity: number) => {
  const currentCart = getCartItems();
  currentCart[index].quantity = quantity;
  
  const cartKey = getCartKey();
  localStorage.setItem(cartKey, JSON.stringify(currentCart));

  // Dispatch a custom event to notify other components
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey } }));

  return currentCart;
};

/**
 * Svuota il carrello dell'utente corrente
 */
export const clearCart = () => {
  const cartKey = getCartKey();
  localStorage.setItem(cartKey, JSON.stringify([]));

  // Dispatch a custom event to notify other components
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cartKey } }));
};