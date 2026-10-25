CREATE TYPE "public"."approval_action" AS ENUM('identity_allocation', 'recall');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('draft', 'allocation_pending', 'allocated', 'reconciled', 'released', 'recalled');--> statement-breakpoint
CREATE TYPE "public"."verification_channel" AS ENUM('qr', 'web', 'ussd');--> statement-breakpoint
CREATE TYPE "public"."print_job_status" AS ENUM('ready', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."production_event_type" AS ENUM('printed', 'rejected', 'unused');--> statement-breakpoint
CREATE TYPE "public"."recall_status" AS ENUM('pending_approval', 'active', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."risk_kind" AS ENUM('possible_clone', 'unreleased_code_scanned', 'consumer_report');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'investigating', 'closed');--> statement-breakpoint
CREATE TYPE "public"."unit_state" AS ENUM('RESERVED', 'PRINTED_PENDING', 'QA_PENDING', 'ACTIVE', 'VOIDED', 'REJECTED', 'RECALLED');--> statement-breakpoint
CREATE TYPE "public"."user_domain" AS ENUM('platform', 'regulator', 'manufacturer');--> statement-breakpoint
CREATE TYPE "public"."verification_outcome" AS ENUM('issued_no_known_alerts', 'suspicious', 'not_released', 'expired', 'recalled', 'unable_to_verify');--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"action" "approval_action" NOT NULL,
	"resource_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requester_id" uuid NOT NULL,
	"request_reason" text,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "independent_approver" CHECK ("approval_requests"."decided_by" is null or "approval_requests"."decided_by" <> "approval_requests"."requester_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"manufacturer_id" uuid,
	"actor_type" varchar(16) NOT NULL,
	"actor_id" uuid,
	"action" varchar(64) NOT NULL,
	"resource_type" varchar(32),
	"resource_id" uuid,
	"decision" varchar(8) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"prev_hash" "bytea" NOT NULL,
	"hash" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" integer GENERATED ALWAYS AS IDENTITY (sequence name "batches_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manufacturer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"factory_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"lot" varchar(32) NOT NULL,
	"manufacture_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"planned_quantity" integer NOT NULL,
	"status" "batch_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"release_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "batch_tenant" UNIQUE("id","manufacturer_id"),
	CONSTRAINT "batch_dates" CHECK ("batches"."expiry_date" > "batches"."manufacture_date"),
	CONSTRAINT "batch_quantity" CHECK ("batches"."planned_quantity" between 1 and 100000)
);
--> statement-breakpoint
CREATE TABLE "consumer_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(12) NOT NULL,
	"unit_id" uuid,
	"channel" "verification_channel" NOT NULL,
	"description" text NOT NULL,
	"region" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_reports_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"unit_id" uuid PRIMARY KEY NOT NULL,
	"format_version" smallint NOT NULL,
	"key_version" smallint NOT NULL,
	"signature" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"state" varchar(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_tenant" UNIQUE("id","manufacturer_id")
);
--> statement-breakpoint
CREATE TABLE "manual_codes" (
	"unit_id" uuid PRIMARY KEY NOT NULL,
	"namespace" varchar(8) NOT NULL,
	"lookup_digest" "bytea" NOT NULL,
	"code_ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" integer GENERATED ALWAYS AS IDENTITY (sequence name "manufacturers_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"legal_name" text NOT NULL,
	"alias" varchar(6) NOT NULL,
	"rc_number" text NOT NULL,
	"sector" text NOT NULL,
	"hq_state" varchar(2) NOT NULL,
	"kyb_status" "review_status" DEFAULT 'pending' NOT NULL,
	"kyb_reviewed_by" uuid,
	"kyb_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manufacturers_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "manufacturers_alias_unique" UNIQUE("alias"),
	CONSTRAINT "alias_format" CHECK ("manufacturers"."alias" ~ '^[A-Z]{2,6}$')
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"membership_id" uuid NOT NULL,
	"role_key" varchar(40) NOT NULL,
	CONSTRAINT "membership_roles_membership_id_role_key_pk" PRIMARY KEY("membership_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"user_id" uuid NOT NULL,
	"role_key" varchar(40) NOT NULL,
	CONSTRAINT "platform_roles_user_id_role_key_pk" PRIMARY KEY("user_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"key_version" smallint NOT NULL,
	"manifest_hash" "bytea" NOT NULL,
	"status" "print_job_status" DEFAULT 'ready' NOT NULL,
	"lease_holder" uuid,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_jobs_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "print_jobs_approval_request_id_unique" UNIQUE("approval_request_id"),
	CONSTRAINT "print_job_tenant" UNIQUE("id","manufacturer_id")
);
--> statement-breakpoint
CREATE TABLE "production_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"print_job_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"type" "production_event_type" NOT NULL,
	"reason" text,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"factory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_tenant" UNIQUE("id","factory_id","manufacturer_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" integer GENERATED ALWAYS AS IDENTITY (sequence name "products_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manufacturer_id" uuid NOT NULL,
	"alias" varchar(8) NOT NULL,
	"name" text NOT NULL,
	"dosage_form" text NOT NULL,
	"strength" text NOT NULL,
	"pack_size" text NOT NULL,
	"gtin" varchar(14),
	"nafdac_reg_no" text,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "product_tenant" UNIQUE("id","manufacturer_id"),
	CONSTRAINT "product_alias_format" CHECK ("products"."alias" ~ '^[A-Z0-9]{2,8}$'),
	CONSTRAINT "gtin_format" CHECK ("products"."gtin" is null or "products"."gtin" ~ '^[0-9]{8,14}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "recalls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"consumer_advice" text NOT NULL,
	"status" "recall_status" DEFAULT 'pending_approval' NOT NULL,
	"initiated_by" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"effective_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"issued" integer NOT NULL,
	"printed" integer NOT NULL,
	"rejected" integer NOT NULL,
	"voided" integer NOT NULL,
	"physical_count" integer NOT NULL,
	"performed_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliations_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "resource_grants" (
	"membership_id" uuid NOT NULL,
	"resource_type" varchar(20) NOT NULL,
	"resource_id" uuid NOT NULL,
	CONSTRAINT "resource_grants_membership_id_resource_type_resource_id_pk" PRIMARY KEY("membership_id","resource_type","resource_id"),
	CONSTRAINT "grant_type" CHECK ("resource_grants"."resource_type" in ('organization','factory','line'))
);
--> statement-breakpoint
CREATE TABLE "risk_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"unit_id" uuid,
	"batch_id" uuid,
	"kind" "risk_kind" NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"user_id" uuid NOT NULL,
	"active_manufacturer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"random_identity" "bytea" NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"print_job_id" uuid NOT NULL,
	"label_index" integer NOT NULL,
	"state" "unit_state" DEFAULT 'RESERVED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"printed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_random_length" CHECK (octet_length("units"."random_identity") = 16)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"password_hash" text NOT NULL,
	"domain" "user_domain" NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid,
	"manufacturer_id" uuid,
	"channel" "verification_channel" NOT NULL,
	"outcome" "verification_outcome" NOT NULL,
	"region" varchar(2),
	"device_hash" "bytea",
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_manufacturer_id_products_id_manufacturer_id_fk" FOREIGN KEY ("product_id","manufacturer_id") REFERENCES "public"."products"("id","manufacturer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_line_id_factory_id_manufacturer_id_production_lines_id_factory_id_manufacturer_id_fk" FOREIGN KEY ("line_id","factory_id","manufacturer_id") REFERENCES "public"."production_lines"("id","factory_id","manufacturer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_reports" ADD CONSTRAINT "consumer_reports_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factories" ADD CONSTRAINT "factories_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_codes" ADD CONSTRAINT "manual_codes_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_kyb_reviewed_by_users_id_fk" FOREIGN KEY ("kyb_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_organization_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."organization_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_lease_holder_users_id_fk" FOREIGN KEY ("lease_holder") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_batch_id_manufacturer_id_batches_id_manufacturer_id_fk" FOREIGN KEY ("batch_id","manufacturer_id") REFERENCES "public"."batches"("id","manufacturer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "public"."print_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_factory_id_manufacturer_id_factories_id_manufacturer_id_fk" FOREIGN KEY ("factory_id","manufacturer_id") REFERENCES "public"."factories"("id","manufacturer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_membership_id_organization_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."organization_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("active_manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_batch_id_manufacturer_id_batches_id_manufacturer_id_fk" FOREIGN KEY ("batch_id","manufacturer_id") REFERENCES "public"."batches"("id","manufacturer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_print_job_id_manufacturer_id_print_jobs_id_manufacturer_id_fk" FOREIGN KEY ("print_job_id","manufacturer_id") REFERENCES "public"."print_jobs"("id","manufacturer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_pending" ON "approval_requests" USING btree ("manufacturer_id","status");--> statement-breakpoint
CREATE INDEX "audit_tenant_time" ON "audit_events" USING btree ("manufacturer_id","seq");--> statement-breakpoint
CREATE INDEX "audit_resource" ON "audit_events" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_lot" ON "batches" USING btree ("product_id","lot");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_code_lookup" ON "manual_codes" USING btree ("namespace","lookup_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_org" ON "organization_memberships" USING btree ("user_id","manufacturer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_event_unit_type" ON "production_events" USING btree ("unit_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "product_alias" ON "products" USING btree ("manufacturer_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_recall_per_batch" ON "recalls" USING btree ("batch_id") WHERE "recalls"."status" in ('pending_approval','active');--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_case_per_unit_kind" ON "risk_cases" USING btree ("unit_id","kind") WHERE "risk_cases"."status" <> 'closed' and "risk_cases"."unit_id" is not null;--> statement-breakpoint
CREATE INDEX "risk_case_tenant" ON "risk_cases" USING btree ("manufacturer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_random_identity" ON "units" USING btree ("random_identity");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_label_position" ON "units" USING btree ("print_job_id","label_index");--> statement-breakpoint
CREATE INDEX "unit_batch_state" ON "units" USING btree ("batch_id","state");--> statement-breakpoint
CREATE INDEX "verification_unit_time" ON "verification_events" USING btree ("unit_id","created_at");--> statement-breakpoint
CREATE INDEX "verification_time" ON "verification_events" USING btree ("created_at");