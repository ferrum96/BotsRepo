CREATE TABLE "contact_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" text NOT NULL,
	"raw_value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amocrm_contact_id" bigint,
	"first_name" text,
	"last_name" text,
	"phone_raw" text,
	"email_raw" text,
	"telegram_username_raw" text,
	"telegram_user_id" bigint,
	"whatsapp_raw" text,
	"profile_url" text,
	"telegram_url" text,
	"vk_url" text,
	"instagram_url" text,
	"website" text,
	"school_name" text,
	"city" text,
	"country" text,
	"timezone" text,
	"specialization" text,
	"comment" text,
	"contact_type" text DEFAULT 'POTENTIAL_ASTRO_PARTNER' NOT NULL,
	"acquisition_source" text NOT NULL,
	"qualification_status" text DEFAULT 'NOT_QUALIFIED' NOT NULL,
	"automation_eligibility" text DEFAULT 'UNKNOWN' NOT NULL,
	"preferred_channel" text,
	"legal_basis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_amocrm_contact_id_unique" UNIQUE("amocrm_contact_id")
);
--> statement-breakpoint
CREATE TABLE "data_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"collected_at" timestamp with time zone,
	"import_row_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_row_id" uuid NOT NULL,
	"candidate_contact_id" uuid NOT NULL,
	"match_reason" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"identifier" text,
	"channel_kind" text,
	"level" text NOT NULL,
	"paused_until" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_usage" (
	"channel_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "channel_usage_channel_id_usage_date_pk" PRIMARY KEY("channel_id","usage_date")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"external_ref" text NOT NULL,
	"can_initiate" boolean DEFAULT false NOT NULL,
	"daily_limit" integer DEFAULT 20 NOT NULL,
	"send_window" jsonb NOT NULL,
	"warmup_until" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"manager_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_limits" (
	"manager_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"daily_limit" integer DEFAULT 20 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "manager_limits_manager_id_usage_date_pk" PRIMARY KEY("manager_id","usage_date")
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"amocrm_user_id" bigint,
	"role" text DEFAULT 'MANAGER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assignment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"amocrm_deal_id" bigint,
	"pipeline" text NOT NULL,
	"stage" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"closed_reason" text,
	"responsible_manager_id" uuid,
	"automation_status" text DEFAULT 'ACTIVE' NOT NULL,
	"automation_step" text DEFAULT 'NEW' NOT NULL,
	"score" integer,
	"rating" text,
	"score_reasons" jsonb,
	"next_action_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_reply_at" timestamp with time zone,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_amocrm_deal_id_unique" UNIQUE("amocrm_deal_id")
);
--> statement-breakpoint
CREATE TABLE "manager_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"manager_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"amocrm_task_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"success_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"manual_rows" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"normalized_payload" jsonb,
	"status" text DEFAULT 'NEW' NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"error_code" text,
	"error_message" text,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"step" text NOT NULL,
	"channel_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"deal_id" uuid,
	"channel_id" uuid,
	"channel_kind" text NOT NULL,
	"direction" text NOT NULL,
	"step" text,
	"template_version_id" uuid,
	"rendered_body" text NOT NULL,
	"external_message_id" text,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"idempotency_key" text,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"required_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fallbacks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"practices_jyotish" boolean,
	"conducts_consultations" boolean,
	"prescribes_stones" text,
	"has_supplier" boolean,
	"monthly_consultations" text,
	"cooperation_interest" text,
	"comment" text,
	"filled_by" uuid,
	"filled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"weights" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid,
	"referral_id" uuid,
	"external_order_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" text NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_external_order_id_unique" UNIQUE("external_order_id")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"promo_code" text NOT NULL,
	"referral_slug" text NOT NULL,
	"connected_at" timestamp with time zone,
	"materials_seen_at" timestamp with time zone,
	"first_referral_at" timestamp with time zone,
	"first_sale_at" timestamp with time zone,
	"activity_status" text DEFAULT 'CONNECTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_contact_id_unique" UNIQUE("contact_id"),
	CONSTRAINT "partners_promo_code_unique" UNIQUE("promo_code"),
	CONSTRAINT "partners_referral_slug_unique" UNIQUE("referral_slug")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"external_client_id" text,
	"attribution_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"diff" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"source" text NOT NULL,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"system" text NOT NULL,
	"operation" text NOT NULL,
	"request_summary" jsonb,
	"response_status" text,
	"response_summary" jsonb,
	"duration_ms" integer,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_identifiers" ADD CONSTRAINT "contact_identifiers_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_provenance" ADD CONSTRAINT "data_provenance_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_candidate_contact_id_contacts_id_fk" FOREIGN KEY ("candidate_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_usage" ADD CONSTRAINT "channel_usage_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_limits" ADD CONSTRAINT "manager_limits_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_responsible_manager_id_managers_id_fk" FOREIGN KEY ("responsible_manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_answers" ADD CONSTRAINT "qualification_answers_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identifiers_unique" ON "contact_identifiers" USING btree ("type","normalized_value");--> statement-breakpoint
CREATE INDEX "contact_identifiers_contact" ON "contact_identifiers" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "data_provenance_contact" ON "data_provenance" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "duplicate_reviews_status" ON "duplicate_reviews" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "suppression_lookup" ON "suppression_list" USING btree ("contact_id","channel_kind");--> statement-breakpoint
CREATE INDEX "suppression_identifier" ON "suppression_list" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_one_active_per_contact" ON "deals" USING btree ("contact_id") WHERE "deals"."pipeline" = 'PARTNER_ACQUISITION' and "deals"."is_active";--> statement-breakpoint
CREATE INDEX "deals_stage" ON "deals" USING btree ("pipeline","stage");--> statement-breakpoint
CREATE INDEX "deals_automation" ON "deals" USING btree ("automation_status","next_action_at");--> statement-breakpoint
CREATE INDEX "deals_manager" ON "deals" USING btree ("responsible_manager_id");--> statement-breakpoint
CREATE INDEX "manager_tasks_open" ON "manager_tasks" USING btree ("manager_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_idempotency" ON "import_rows" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "import_rows_batch_status" ON "import_rows" USING btree ("batch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_events_unique" ON "inbound_events" USING btree ("channel","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency" ON "messages" USING btree ("idempotency_key") WHERE "messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "messages_deal_created" ON "messages" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_status_scheduled" ON "messages" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_unique" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_one_per_deal" ON "qualification_answers" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "orders_partner_date" ON "orders" USING btree ("partner_id","ordered_at");--> statement-breakpoint
CREATE INDEX "referrals_partner" ON "referrals" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_events_contact" ON "automation_events" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_events_correlation" ON "automation_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "automation_events_type_date" ON "automation_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "integration_logs_system_date" ON "integration_logs" USING btree ("system","created_at");