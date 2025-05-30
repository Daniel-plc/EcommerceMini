import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabase } from "./supabase";

export async function registerRoutes(app: Express): Promise<Server> {
  // API routes per l'applicazione
  // Queste route sono principalmente utilizzate come fallback se le chiamate dirette dal client Supabase falliscono

  // Endpoint di health check per verificare che il server sia attivo
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/products', async (req, res) => {
    try {
      // Ora utilizziamo direttamente Supabase SDK lato server
      const { data, error } = await supabase
        .from("prodotti")
        .select("*");
      
      if (error) {
        throw new Error(`Errore nel recupero dei prodotti: ${error.message}`);
      }
      
      res.json(data);
    } catch (error: any) {
      console.error('Errore API /api/products:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/user', async (req, res) => {
    try {
      // Questa route richiede autenticazione - esempio di come potrebbe essere implementata
      // In una vera implementazione, verrebbe controllato il token JWT dall'header
      res.json({ message: 'Autenticazione richiesta per questa operazione' });
    } catch (error: any) {
      console.error('Errore API /api/user:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
