// api/index.ts
import express, { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.ts";

const app = express();

// 1) Parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2) Logging semplice di ogni chiamata /api
app.use((req, res, next) => {
  const start = Date.now();
  const oldJson = res.json;
  let payload: any;

  res.json = function (body) {
    payload = body;
    return oldJson.call(this, body);
  };

  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      let line = `${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`;
      if (payload) line += ` :: ${JSON.stringify(payload)}`;
      console.log(line.length > 100 ? line.slice(0, 99) + "…" : line);
    }
  });

  next();
});

// 3) Registra le rotte (health, products, user…)
registerRoutes(app);

// 4) Middleware di gestione errori
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

// 5) NON chiamare app.listen(): Vercel lo fa per te
export default app;


