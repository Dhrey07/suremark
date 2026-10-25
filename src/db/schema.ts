import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const userDomain = pgEnum("user_domain", ["platform", "regulator", "manufacturer"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const batchStatus = pgEnum("batch_status", [
  "draft",
  "allocation_pending",
  "allocated",
  "reconciled",
  "released",
  "recalled",
]);
export const unitState = pgEnum("unit_state", [
  "RESERVED",
  "PRINTED_PENDING",
  "QA_PENDING",
  "ACTIVE",
  "VOIDED",
  "REJECTED",
  "RECALLED",
]);
export const printJobStatus = pgEnum("print_job_status", ["ready", "in_progress", "completed"]);
export const productionEventType = pgEnum("production_event_type", ["printed", "rejected", "unused"]);
export const approvalAction = pgEnum("approval_action", ["identity_allocation", "recall"]);
export const recallStatus = pgEnum("recall_status", ["pending_approval", "active", "rejected"]);
export const channel = pgEnum("verification_channel", ["qr", "web", "ussd"]);
export const verificationOutcome = pgEnum("verification_outcome", [
  "issued_no_known_alerts",
  "suspicious",
  "not_released",
  "expired",
  "recalled",
  "unable_to_verify",
]);
export const riskKind = pgEnum("risk_kind", ["possible_clone", "unreleased_code_scanned", "consumer_report"]);
export const riskSeverity = pgEnum("risk_severity", ["low", "medium", "high"]);
export const riskStatus = pgEnum("risk_status", ["open", "investigating", "closed"]);

// ---------- Identity & tenancy ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  passwordHash: text("password_hash").notNull(),
  domain: userDomain("domain").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: bytea("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  activeManufacturerId: uuid("active_manufacturer_id").references(() => manufacturers.id),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const manufacturers = pgTable(
  "manufacturers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: integer("short_id").generatedAlwaysAsIdentity().notNull().unique(),
    legalName: text("legal_name").notNull(),
    alias: varchar("alias", { length: 6 }).notNull().unique(),
    rcNumber: text("rc_number").notNull(),
    sector: text("sector").notNull(),
    hqState: varchar("hq_state", { length: 2 }).notNull(),
    kybStatus: reviewStatus("kyb_status").notNull().default("pending"),
    kybReviewedBy: uuid("kyb_reviewed_by").references(() => users.id),
    kybReviewedAt: timestamp("kyb_reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("alias_format", sql`${t.alias} ~ '^[A-Z]{2,6}$'`)],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_user_org").on(t.userId, t.manufacturerId)],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    membershipId: uuid("membership_id").notNull().references(() => organizationMemberships.id),
    roleKey: varchar("role_key", { length: 40 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.roleKey] })],
);

// resource_type: organization | factory | line. resource_id always set (organization grants hold the manufacturer id).
export const resourceGrants = pgTable(
  "resource_grants",
  {
    membershipId: uuid("membership_id").notNull().references(() => organizationMemberships.id),
    resourceType: varchar("resource_type", { length: 20 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.resourceType, t.resourceId] }),
    check("grant_type", sql`${t.resourceType} in ('organization','factory','line')`),
  ],
);

// Platform-side role assignment (platform operators and regulator analysts).
export const platformRoles = pgTable(
  "platform_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    roleKey: varchar("role_key", { length: 40 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleKey] })],
);

// ---------- Catalog & sites ----------

export const factories = pgTable(
  "factories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    name: text("name").notNull(),
    address: text("address").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("factory_tenant").on(t.id, t.manufacturerId)],
);

export const productionLines = pgTable(
  "production_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull(),
    factoryId: uuid("factory_id").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("line_tenant").on(t.id, t.factoryId, t.manufacturerId),
    foreignKey({ columns: [t.factoryId, t.manufacturerId], foreignColumns: [factories.id, factories.manufacturerId] }),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: integer("short_id").generatedAlwaysAsIdentity().notNull().unique(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    alias: varchar("alias", { length: 8 }).notNull(),
    name: text("name").notNull(),
    dosageForm: text("dosage_form").notNull(),
    strength: text("strength").notNull(),
    packSize: text("pack_size").notNull(),
    gtin: varchar("gtin", { length: 14 }),
    nafdacRegNo: text("nafdac_reg_no"),
    status: reviewStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("product_alias").on(t.manufacturerId, t.alias),
    unique("product_tenant").on(t.id, t.manufacturerId),
    check("product_alias_format", sql`${t.alias} ~ '^[A-Z0-9]{2,8}$'`),
    check("gtin_format", sql`${t.gtin} is null or ${t.gtin} ~ '^[0-9]{8,14}$'`),
  ],
);

// ---------- Batches & issuance ----------

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: integer("short_id").generatedAlwaysAsIdentity().notNull().unique(),
    manufacturerId: uuid("manufacturer_id").notNull(),
    productId: uuid("product_id").notNull(),
    factoryId: uuid("factory_id").notNull(),
    lineId: uuid("line_id").notNull(),
    lot: varchar("lot", { length: 32 }).notNull(),
    manufactureDate: date("manufacture_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    plannedQuantity: integer("planned_quantity").notNull(),
    status: batchStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    releasedBy: uuid("released_by").references(() => users.id),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseNote: text("release_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("batch_lot").on(t.productId, t.lot),
    unique("batch_tenant").on(t.id, t.manufacturerId),
    foreignKey({ columns: [t.productId, t.manufacturerId], foreignColumns: [products.id, products.manufacturerId] }),
    foreignKey({
      columns: [t.lineId, t.factoryId, t.manufacturerId],
      foreignColumns: [productionLines.id, productionLines.factoryId, productionLines.manufacturerId],
    }),
    check("batch_dates", sql`${t.expiryDate} > ${t.manufactureDate}`),
    check("batch_quantity", sql`${t.plannedQuantity} between 1 and 100000`),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    action: approvalAction("action").notNull(),
    resourceId: uuid("resource_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    requestReason: text("request_reason"),
    status: reviewStatus("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decisionReason: text("decision_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Maker-checker enforced at the database as well as in the service layer.
    check("independent_approver", sql`${t.decidedBy} is null or ${t.decidedBy} <> ${t.requesterId}`),
    index("approval_pending").on(t.manufacturerId, t.status),
  ],
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull(),
    batchId: uuid("batch_id").notNull().unique(),
    lineId: uuid("line_id").notNull().references(() => productionLines.id),
    approvalRequestId: uuid("approval_request_id").notNull().references(() => approvalRequests.id).unique(),
    quantity: integer("quantity").notNull(),
    keyVersion: smallint("key_version").notNull(),
    manifestHash: bytea("manifest_hash").notNull(),
    status: printJobStatus("status").notNull().default("ready"),
    leaseHolder: uuid("lease_holder").references(() => users.id),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("print_job_tenant").on(t.id, t.manufacturerId),
    foreignKey({ columns: [t.batchId, t.manufacturerId], foreignColumns: [batches.id, batches.manufacturerId] }),
  ],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    randomIdentity: bytea("random_identity").notNull(),
    manufacturerId: uuid("manufacturer_id").notNull(),
    productId: uuid("product_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    printJobId: uuid("print_job_id").notNull(),
    labelIndex: integer("label_index").notNull(),
    state: unitState("state").notNull().default("RESERVED"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    printedAt: timestamp("printed_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("unit_random_identity").on(t.randomIdentity),
    uniqueIndex("unit_label_position").on(t.printJobId, t.labelIndex),
    index("unit_batch_state").on(t.batchId, t.state),
    foreignKey({ columns: [t.batchId, t.manufacturerId], foreignColumns: [batches.id, batches.manufacturerId] }),
    foreignKey({ columns: [t.printJobId, t.manufacturerId], foreignColumns: [printJobs.id, printJobs.manufacturerId] }),
    check("unit_random_length", sql`octet_length(${t.randomIdentity}) = 16`),
  ],
);

export const credentials = pgTable("credentials", {
  unitId: uuid("unit_id").primaryKey().references(() => units.id),
  formatVersion: smallint("format_version").notNull(),
  keyVersion: smallint("key_version").notNull(),
  signature: bytea("signature").notNull(),
  createdAt: createdAt(),
});

export const manualCodes = pgTable(
  "manual_codes",
  {
    unitId: uuid("unit_id").primaryKey().references(() => units.id),
    namespace: varchar("namespace", { length: 8 }).notNull(),
    lookupDigest: bytea("lookup_digest").notNull(),
    codeCiphertext: bytea("code_ciphertext").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("manual_code_lookup").on(t.namespace, t.lookupDigest)],
);

export const productionEvents = pgTable(
  "production_events",
  {
    // Client-supplied event id doubles as the idempotency key.
    id: uuid("id").primaryKey(),
    manufacturerId: uuid("manufacturer_id").notNull(),
    printJobId: uuid("print_job_id").notNull().references(() => printJobs.id),
    unitId: uuid("unit_id").notNull().references(() => units.id),
    type: productionEventType("type").notNull(),
    reason: text("reason"),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("production_event_unit_type").on(t.unitId, t.type)],
);

export const reconciliations = pgTable("reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
  batchId: uuid("batch_id").notNull().unique().references(() => batches.id),
  issued: integer("issued").notNull(),
  printed: integer("printed").notNull(),
  rejected: integer("rejected").notNull(),
  voided: integer("voided").notNull(),
  physicalCount: integer("physical_count").notNull(),
  performedBy: uuid("performed_by").notNull().references(() => users.id),
  note: text("note"),
  createdAt: createdAt(),
});

export const recalls = pgTable(
  "recalls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    reason: text("reason").notNull(),
    consumerAdvice: text("consumer_advice").notNull(),
    status: recallStatus("status").notNull().default("pending_approval"),
    initiatedBy: uuid("initiated_by").notNull().references(() => users.id),
    approvalRequestId: uuid("approval_request_id").notNull().references(() => approvalRequests.id),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("one_open_recall_per_batch")
      .on(t.batchId)
      .where(sql`${t.status} in ('pending_approval','active')`),
  ],
);

// ---------- Consumer verification & risk ----------

export const verificationEvents = pgTable(
  "verification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id").references(() => units.id),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    channel: channel("channel").notNull(),
    outcome: verificationOutcome("outcome").notNull(),
    region: varchar("region", { length: 2 }),
    deviceHash: bytea("device_hash"),
    signals: jsonb("signals").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    index("verification_unit_time").on(t.unitId, t.createdAt),
    index("verification_time").on(t.createdAt),
  ],
);

export const riskCases = pgTable(
  "risk_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    unitId: uuid("unit_id").references(() => units.id),
    batchId: uuid("batch_id").references(() => batches.id),
    kind: riskKind("kind").notNull(),
    severity: riskSeverity("severity").notNull(),
    status: riskStatus("status").notNull().default("open"),
    summary: text("summary").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    occurrences: integer("occurrences").notNull().default(1),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("one_open_case_per_unit_kind")
      .on(t.unitId, t.kind)
      .where(sql`${t.status} <> 'closed' and ${t.unitId} is not null`),
    index("risk_case_tenant").on(t.manufacturerId, t.status),
  ],
);

export const consumerReports = pgTable("consumer_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: varchar("reference", { length: 12 }).notNull().unique(),
  unitId: uuid("unit_id").references(() => units.id),
  channel: channel("channel").notNull(),
  description: text("description").notNull(),
  region: varchar("region", { length: 2 }),
  createdAt: createdAt(),
});

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ---------- Audit ----------

export const auditEvents = pgTable(
  "audit_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    manufacturerId: uuid("manufacturer_id"),
    actorType: varchar("actor_type", { length: 16 }).notNull(),
    actorId: uuid("actor_id"),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 32 }),
    resourceId: uuid("resource_id"),
    decision: varchar("decision", { length: 8 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    prevHash: bytea("prev_hash").notNull(),
    hash: bytea("hash").notNull(),
  },
  (t) => [
    index("audit_tenant_time").on(t.manufacturerId, t.seq),
    index("audit_resource").on(t.resourceId),
  ],
);
