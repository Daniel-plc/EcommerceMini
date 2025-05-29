import { pgTable, pgView, text, serial, integer, timestamp, jsonb, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Products table
export const products = pgTable("prodotti", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  descrizione: text("descrizione").notNull(),
  immagine_url: text("immagine_url").notNull(),
});

export const insertProductSchema = createInsertSchema(products).pick({
  nome: true,
  descrizione: true,
  immagine_url: true,
});

// Product variants table
export const productVariants = pgTable("varianti_prodotto", {
  id: serial("id").primaryKey(),
  prodotto_id: integer("prodotto_id").notNull().references(() => products.id),
  formato: text("formato").notNull(),
  confezione: text("confezione").notNull(),
  visibile: boolean("visibile").default(true),
});

export const insertProductVariantSchema = createInsertSchema(productVariants).pick({
  prodotto_id: true,
  formato: true,
  confezione: true,
  visibile: true,
});

// Orders table
export const orders = pgTable("ordini", {
  id: serial("id").primaryKey(),
  utente_id: text("utente_id").notNull(),
  data: timestamp("data").notNull().defaultNow(),
  stato: text("stato").notNull(),
  numero_ordine: integer("numero_ordine"),  // Nuovo campo aggiunto al DB
});

export const insertOrderSchema = createInsertSchema(orders).pick({
  utente_id: true,
  data: true,
  stato: true,
});

// Tabella strutture
export const strutture = pgTable("strutture", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  descrizione: text("descrizione"),
  visibile: boolean("visibile").default(true),
});

// Tabella varianti_struttura (associazione tra varianti e strutture)
export const variantiStruttura = pgTable("varianti_struttura", {
  id: serial("id").primaryKey(),
  variante_id: integer("variante_id").notNull().references(() => productVariants.id),
  struttura_id: integer("struttura_id").notNull().references(() => strutture.id),
  visibile: boolean("visibile").default(true),
});

// Tabella immagini per le varianti
export const immaginiVarianti = pgTable("immagini_varianti", {
  id: serial("id").primaryKey(),
  prodotto_id: integer("prodotto_id").notNull().references(() => products.id),
  variante_id: integer("variante_id").notNull().references(() => productVariants.id),
  struttura_id: integer("struttura_id").notNull().references(() => strutture.id),
  url: text("url").notNull(),
});

// Order lines table
export const orderLines = pgTable("righe_ordine", {
  id: serial("id").primaryKey(),
  ordine_id: integer("ordine_id").notNull().references(() => orders.id),
  variante_id: integer("variante_id").notNull().references(() => productVariants.id),
  struttura_id: integer("struttura_id").references(() => strutture.id),
  quantità: integer("quantità").notNull(), // Aggiornato con accento per riflettere il DB Supabase
  prodotto_id: integer("prodotto_id"),
  configurazione: jsonb("configurazione"),
});

// Lo schema di inserimento lo definiremo manualmente usando Zod per evitare problemi con l'accento
export const insertOrderLineSchema = z.object({
  ordine_id: z.number(),
  variante_id: z.number(),
  struttura_id: z.number().optional(),
  quantità: z.number(),
  prodotto_id: z.number().optional(),
  configurazione: z.record(z.string()).optional(),
});

// Define the types
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderLine = typeof orderLines.$inferSelect;
export type InsertOrderLine = z.infer<typeof insertOrderLineSchema>;

export type Struttura = typeof strutture.$inferSelect;
export type VarianteStruttura = typeof variantiStruttura.$inferSelect;
export type ImmagineVariante = typeof immaginiVarianti.$inferSelect;

// Original user types from existing schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Definizione della vista stato_invio_ordine
export const statoInvioOrdine = pgView("stato_invio_ordine", {
  utente_id: text("utente_id").notNull(),
  ordini_oggi: integer("ordini_oggi").notNull(),
  max_ordini_giornalieri: integer("max_ordini_giornalieri").notNull(),
  giorno_valido: boolean("giorno_valido").notNull(),
}).existing();

export type StatoInvioOrdine = typeof statoInvioOrdine.$inferSelect;

// Definizione della tabella config_orari (orari apertura e giorni esclusi)
export const configOrari = pgTable("config_orari", {
  id: serial("id").primaryKey(),
  orario_inizio: text("orario_inizio").notNull(),
  orario_fine: text("orario_fine").notNull(),
  giorni_esclusi: text("giorni_esclusi").array(),
  date_escluse: timestamp("date_escluse").array(),
  attivo: boolean("attivo").default(true),
  max_ordini_gior: integer("max_ordini_gior").default(2),
});

export type ConfigOrari = typeof configOrari.$inferSelect;
