#!/bin/bash

# Aggiorna precaricamento dei codici
sed -i 's/console\.error("Errore nel precaricamento dei codici prodotto:", err)/productsLogger.error("Errore nel precaricamento dei codici prodotto:", err)/g' client/src/pages/Products.tsx

# Aggiorna fetch immagini dinamiche
sed -i 's/console\.error("Errore fetch immagini dinamiche:", imgError)/productsLogger.error("Errore fetch immagini dinamiche:", imgError)/g' client/src/pages/Products.tsx

# Aggiorna errore generico nel caricamento
sed -i 's/console\.error("Errore generico nel caricamento:", err)/productsLogger.error("Errore generico nel caricamento:", err)/g' client/src/pages/Products.tsx

# Aggiorna errore recupero codice prodotto
sed -i 's/console\.error("Errore recupero codice prodotto:", err)/productsLogger.error("Errore recupero codice prodotto:", err)/g' client/src/pages/Products.tsx

# Aggiorna errore aggiornamento immagine
sed -i 's/console\.error("Errore aggiornamento immagine:", err)/productsLogger.error("Errore aggiornamento immagine:", err)/g' client/src/pages/Products.tsx

# Aggiorna errore nell'aggiunta al carrello
sed -i 's/console\.error("Errore nell'"'"'aggiunta al carrello:", error)/productsLogger.error("Errore nell'"'"'aggiunta al carrello:", error)/g' client/src/pages/Products.tsx

# Aggiorna il console.log rimanente
sed -i 's/console\.log(`Caratteristica \${chiaveNorm}:`/productsLogger.debug(`Caratteristica \${chiaveNorm}:`/g' client/src/pages/Products.tsx

