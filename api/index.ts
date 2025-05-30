import express, { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";

const app = express();

// JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// semplice logging di tutte le API
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

// qui registriamo le nostre rotte
registerRoutes(app);

// gestione degli errori
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

// **NON** facciamo mai `app.listen()` qui: Vercel lo gestisce per noi
export default app;

