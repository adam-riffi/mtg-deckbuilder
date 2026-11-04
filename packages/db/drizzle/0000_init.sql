CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_tags" (
	"oracle_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"source" text DEFAULT 'scryfall' NOT NULL,
	CONSTRAINT "card_tags_oracle_id_tag_pk" PRIMARY KEY("oracle_id","tag")
);
--> statement-breakpoint
CREATE TABLE "change_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"action" text NOT NULL,
	"oracle_id" uuid NOT NULL,
	"to_oracle_id" uuid,
	"qty" integer DEFAULT 1 NOT NULL,
	"from_zone" text,
	"to_zone" text,
	"category" text,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"thread_id" uuid,
	"summary" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"deck_id" uuid,
	"title" text DEFAULT 'New chat' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"oracle_id" uuid NOT NULL,
	"finish" text DEFAULT 'nonfoil' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"condition" text DEFAULT 'NM' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_printing_id_finish_condition_language_pk" PRIMARY KEY("collection_id","printing_id","finish","condition","language")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'My collection' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"oracle_id" uuid NOT NULL,
	"printing_id" uuid,
	"qty" integer DEFAULT 1 NOT NULL,
	"zone" text DEFAULT 'mainboard' NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"finish" text DEFAULT 'nonfoil' NOT NULL,
	"addedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"user_id" text,
	"source" text DEFAULT 'user' NOT NULL,
	"kind" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"change_set_id" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"format" text DEFAULT 'commander' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"primer" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_package" boolean DEFAULT false NOT NULL,
	"target_bracket" integer,
	"budget_amount" double precision,
	"budget_currency" text DEFAULT 'eur' NOT NULL,
	"cover_printing_id" uuid,
	"auto_apply_ai" boolean DEFAULT false NOT NULL,
	"category_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "oracle_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_search" text NOT NULL,
	"layout" text NOT NULL,
	"mana_cost" text,
	"cmc" real DEFAULT 0 NOT NULL,
	"type_line" text NOT NULL,
	"oracle_text" text DEFAULT '' NOT NULL,
	"oracle_search" text DEFAULT '' NOT NULL,
	"colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"color_identity" text[] DEFAULT '{}'::text[] NOT NULL,
	"colors_mask" integer DEFAULT 0 NOT NULL,
	"identity_mask" integer DEFAULT 0 NOT NULL,
	"produced_mask" integer DEFAULT 0 NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"power" text,
	"toughness" text,
	"loyalty" text,
	"defense" text,
	"power_num" real,
	"toughness_num" real,
	"loyalty_num" real,
	"defense_num" real,
	"legalities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"produced_mana" text[] DEFAULT '{}'::text[] NOT NULL,
	"faces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"all_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"game_changer" boolean DEFAULT false NOT NULL,
	"reserved" boolean DEFAULT false NOT NULL,
	"edhrec_rank" integer,
	"games" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_usd" double precision,
	"min_eur" double precision,
	"min_tix" double precision,
	"max_rarity" integer DEFAULT 0 NOT NULL,
	"first_released" date,
	"default_printing_id" uuid,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(type_line, '')), 'B') || setweight(to_tsvector('english', coalesce(oracle_text, '')), 'C')) STORED,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"printing_id" uuid NOT NULL,
	"day" date NOT NULL,
	"usd" double precision,
	"usd_foil" double precision,
	"eur" double precision,
	"eur_foil" double precision,
	"tix" double precision,
	CONSTRAINT "price_snapshots_printing_id_day_pk" PRIMARY KEY("printing_id","day")
);
--> statement-breakpoint
CREATE TABLE "printings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"oracle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"set_code" text NOT NULL,
	"set_name" text NOT NULL,
	"collector_number" text NOT NULL,
	"rarity" text NOT NULL,
	"rarity_rank" integer DEFAULT 0 NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"released_at" date NOT NULL,
	"artist" text,
	"image_uris" jsonb,
	"face_image_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finishes" text[] DEFAULT '{}'::text[] NOT NULL,
	"prices" jsonb NOT NULL,
	"usd" double precision,
	"usd_foil" double precision,
	"eur" double precision,
	"eur_foil" double precision,
	"tix" double precision,
	"promo" boolean DEFAULT false NOT NULL,
	"digital" boolean DEFAULT false NOT NULL,
	"full_art" boolean DEFAULT false NOT NULL,
	"frame" text,
	"border_color" text,
	"frame_effects" text[] DEFAULT '{}'::text[] NOT NULL,
	"promo_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"illustration_id" uuid,
	"scryfall_uri" text,
	"games" text[] DEFAULT '{}'::text[] NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rulings" (
	"id" serial PRIMARY KEY NOT NULL,
	"oracle_id" uuid NOT NULL,
	"source" text NOT NULL,
	"published_at" date NOT NULL,
	"comment" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set_items" ADD CONSTRAINT "change_set_items_change_set_id_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_printing_id_printings_id_fk" FOREIGN KEY ("printing_id") REFERENCES "public"."printings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_oracle_id_oracle_cards_id_fk" FOREIGN KEY ("oracle_id") REFERENCES "public"."oracle_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_printing_id_printings_id_fk" FOREIGN KEY ("printing_id") REFERENCES "public"."printings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_events" ADD CONSTRAINT "deck_events_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printings" ADD CONSTRAINT "printings_oracle_id_oracle_cards_id_fk" FOREIGN KEY ("oracle_id") REFERENCES "public"."oracle_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_tags_tag" ON "card_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "change_set_items_set" ON "change_set_items" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "change_sets_deck" ON "change_sets" USING btree ("deck_id","status");--> statement-breakpoint
CREATE INDEX "chat_messages_thread" ON "chat_messages" USING btree ("thread_id","createdAt");--> statement-breakpoint
CREATE INDEX "chat_threads_deck" ON "chat_threads" USING btree ("deck_id","updatedAt");--> statement-breakpoint
CREATE INDEX "collection_items_oracle" ON "collection_items" USING btree ("collection_id","oracle_id");--> statement-breakpoint
CREATE INDEX "deck_cards_deck" ON "deck_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deck_cards_unique" ON "deck_cards" USING btree ("deck_id","oracle_id","zone");--> statement-breakpoint
CREATE INDEX "deck_events_deck" ON "deck_events" USING btree ("deck_id","id");--> statement-breakpoint
CREATE INDEX "deck_versions_deck" ON "deck_versions" USING btree ("deck_id","createdAt");--> statement-breakpoint
CREATE INDEX "decks_user" ON "decks" USING btree ("user_id","updatedAt");--> statement-breakpoint
CREATE INDEX "folders_user" ON "folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oracle_name_trgm" ON "oracle_cards" USING gin ("name_search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "oracle_text_trgm" ON "oracle_cards" USING gin (lower("oracle_search") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "oracle_type_trgm" ON "oracle_cards" USING gin (lower("type_line") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "oracle_search_vector" ON "oracle_cards" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "oracle_tags" ON "oracle_cards" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "oracle_keywords" ON "oracle_cards" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "oracle_legalities" ON "oracle_cards" USING gin ("legalities");--> statement-breakpoint
CREATE INDEX "oracle_cmc" ON "oracle_cards" USING btree ("cmc");--> statement-breakpoint
CREATE INDEX "oracle_identity" ON "oracle_cards" USING btree ("identity_mask");--> statement-breakpoint
CREATE INDEX "oracle_name" ON "oracle_cards" USING btree ("name");--> statement-breakpoint
CREATE INDEX "printings_oracle" ON "printings" USING btree ("oracle_id");--> statement-breakpoint
CREATE INDEX "printings_set" ON "printings" USING btree ("set_code","collector_number");--> statement-breakpoint
CREATE INDEX "printings_artist_trgm" ON "printings" USING gin (lower("artist") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "rulings_oracle" ON "rulings" USING btree ("oracle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rulings_hash" ON "rulings" USING btree ("hash");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_scope_key" ON "settings" USING btree ("scope","key");