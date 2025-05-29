CREATE TABLE "righe_ordine" (
	"id" serial PRIMARY KEY NOT NULL,
	"ordine_id" integer NOT NULL,
	"variante_id" integer NOT NULL,
	"struttura_id" integer,
	"quantita" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordini" (
	"id" serial PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"data" timestamp DEFAULT now() NOT NULL,
	"stato" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varianti_prodotto" (
	"id" serial PRIMARY KEY NOT NULL,
	"prodotto_id" integer NOT NULL,
	"formato" text NOT NULL,
	"confezione" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prodotti" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descrizione" text NOT NULL,
	"immagine_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strutture" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descrizione" text,
	"visibile" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "righe_ordine" ADD CONSTRAINT "righe_ordine_ordine_id_ordini_id_fk" FOREIGN KEY ("ordine_id") REFERENCES "public"."ordini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "righe_ordine" ADD CONSTRAINT "righe_ordine_variante_id_varianti_prodotto_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianti_prodotto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "righe_ordine" ADD CONSTRAINT "righe_ordine_struttura_id_strutture_id_fk" FOREIGN KEY ("struttura_id") REFERENCES "public"."strutture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varianti_prodotto" ADD CONSTRAINT "varianti_prodotto_prodotto_id_prodotti_id_fk" FOREIGN KEY ("prodotto_id") REFERENCES "public"."prodotti"("id") ON DELETE no action ON UPDATE no action;