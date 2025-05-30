// api/routes.ts
import { createClient } from "@supabase/supabase-js";
import { Express, Request, Response } from "express";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/products", async (_req: Request, res: Response) => {
    const { data, error } = await supabase.from("prodotti").select("*");
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  });

  app.get("/api/user", (_req: Request, res: Response) => {
    res.json({ message: "Autenticazione richiesta per questa operazione" });
  });
}

