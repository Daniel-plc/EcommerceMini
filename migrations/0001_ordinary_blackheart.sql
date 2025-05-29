CREATE TABLE "immagini_varianti" (
	"id" serial PRIMARY KEY NOT NULL,
	"prodotto_id" integer NOT NULL,
	"variante_id" integer NOT NULL,
	"struttura_id" integer NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varianti_struttura" (
	"id" serial PRIMARY KEY NOT NULL,
	"variante_id" integer NOT NULL,
	"struttura_id" integer NOT NULL,
	"visibile" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "varianti_prodotto" ADD COLUMN "visibile" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "immagini_varianti" ADD CONSTRAINT "immagini_varianti_prodotto_id_prodotti_id_fk" FOREIGN KEY ("prodotto_id") REFERENCES "public"."prodotti"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immagini_varianti" ADD CONSTRAINT "immagini_varianti_variante_id_varianti_prodotto_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianti_prodotto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immagini_varianti" ADD CONSTRAINT "immagini_varianti_struttura_id_strutture_id_fk" FOREIGN KEY ("struttura_id") REFERENCES "public"."strutture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varianti_struttura" ADD CONSTRAINT "varianti_struttura_variante_id_varianti_prodotto_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianti_prodotto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varianti_struttura" ADD CONSTRAINT "varianti_struttura_struttura_id_strutture_id_fk" FOREIGN KEY ("struttura_id") REFERENCES "public"."strutture"("id") ON DELETE no action ON UPDATE no action;