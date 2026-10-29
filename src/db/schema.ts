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
export const manufacturerOperationalStatus = pgEnum("manufacturer_operational_status", ["active", "suspended"]);
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
export const regulatoryValidationStatus = pgEnum("regulatory_validation_status", [
  "not_submitted",
  "pending_verification",
  "authoritative_verified",
  "simulated_match",
  "mismatch",
  "verification_unavailable",
  "rejected",
  "expired_inactive",
]);
export const cartonStatus = pgEnum("carton_status", ["reserved", "printed", "released", "voided", "recalled"]);
export const exportJobStatus = pgEnum("export_job_status", ["queued", "completed", "failed", "expired"]);
export const exportJobType = pgEnum("export_job_type", ["csv", "unit_labels_pdf", "carton_labels_pdf", "batch_summary_pdf"]);
export const signingKeyStatus = pgEnum("signing_key_status", ["active", "verify_only", "revoked"]);
export const allocationStatus = pgEnum("allocation_status", ["queued", "issuing", "completed", "failed"]);
export const credentialType = pgEnum("credential_type", ["batch", "carton", "unit"]);
export const authenticationAlgorithm = pgEnum("authentication_algorithm", ["hmac_sha256", "ed25519"]);
export const credentialIssuanceStatus = pgEnum("credential_issuance_status", ["issued", "revoked"]);
export const signingKeyPurpose = pgEnum("signing_key_purpose", ["batch", "carton", "unit"]);
export const registryKeyStatus = pgEnum("registry_key_status", ["pending", "active", "retired", "revoked"]);
export const cryptographicResult = pgEnum("cryptographic_result", [
  "valid",
  "invalid",
  "malformed",
  "unsupported_version",
  "unknown_key",
  "key_revoked",
  "unavailable",
]);
export const registrationResult = pgEnum("registration_result", ["registered", "not_registered", "mismatch", "not_checked", "unavailable"]);
export const lifecycleResult = pgEnum("lifecycle_result", ["released", "not_released", "rejected", "quarantined", "recalled", "expired", "not_checked", "unavailable"]);
export const verificationVerdict = pgEnum("verification_verdict", [
  "verified_released",
  "crypto_invalid",
  "malformed_credential",
  "unsupported_version",
  "unknown_key",
  "key_revoked",
  "identity_not_registered",
  "identity_mismatch",
  "unit_not_released",
  "unit_rejected",
  "unit_quarantined",
  "unit_recalled",
  "unit_expired",
  "suspicious_activity",
  "verification_unavailable",
]);

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

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    tokenHash: bytea("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_user_time").on(t.userId, t.createdAt)],
);

export const manufacturers = pgTable(
  "manufacturers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: integer("short_id").generatedAlwaysAsIdentity().notNull().unique(),
    legalName: text("legal_name").notNull(),
    alias: varchar("alias", { length: 6 }).notNull().unique(),
    prefixAssignedAt: timestamp("prefix_assigned_at", { withTimezone: true }).notNull().defaultNow(),
    rcNumber: text("rc_number").notNull(),
    sector: text("sector").notNull(),
    hqState: varchar("hq_state", { length: 2 }).notNull(),
    kybStatus: reviewStatus("kyb_status").notNull().default("pending"),
    operationalStatus: manufacturerOperationalStatus("operational_status").notNull().default("active"),
    statusReason: text("status_reason"),
    statusChangedBy: uuid("status_changed_by").references(() => users.id),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    kybReviewedBy: uuid("kyb_reviewed_by").references(() => users.id),
    kybReviewedAt: timestamp("kyb_reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("alias_format", sql`${t.alias} ~ '^[A-Z]{2,6}$'`)],
);

export const manufacturerReviewEvents = pgTable(
  "manufacturer_review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    action: varchar("action", { length: 40 }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("manufacturer_review_history").on(t.manufacturerId, t.createdAt)],
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

export const productFamilies = pgTable(
  "product_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    name: text("name").notNull(),
    brand: text("brand").notNull(),
    code: varchar("code", { length: 4 }).notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("product_family_name").on(t.manufacturerId, t.name),
    uniqueIndex("product_family_code").on(t.manufacturerId, t.code),
    unique("product_family_tenant").on(t.id, t.manufacturerId),
    check("product_family_code_format", sql`${t.code} ~ '^[A-Z]{2,4}$'`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: integer("short_id").generatedAlwaysAsIdentity().notNull().unique(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    familyId: uuid("family_id").references(() => productFamilies.id),
    alias: varchar("alias", { length: 8 }).notNull(),
    name: text("name").notNull(),
    brand: text("brand").notNull().default("Unbranded"),
    variant: text("variant").notNull().default(""),
    category: text("category").notNull().default("General"),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    dosageForm: text("dosage_form").notNull(),
    strength: text("strength").notNull(),
    packSize: text("pack_size").notNull(),
    packagingType: text("packaging_type").notNull().default("Unit"),
    netQuantity: integer("net_quantity").notNull().default(1),
    measurementUnit: varchar("measurement_unit", { length: 24 }).notNull().default("unit"),
    manufacturingRequirements: text("manufacturing_requirements"),
    shelfLifeDays: integer("shelf_life_days").notNull().default(730),
    gtin: varchar("gtin", { length: 14 }),
    nafdacRegNo: text("nafdac_reg_no"),
    regulatoryStatus: regulatoryValidationStatus("regulatory_status").notNull().default("not_submitted"),
    regulatorySource: text("regulatory_source"),
    regulatoryVerifiedAt: timestamp("regulatory_verified_at", { withTimezone: true }),
    regulatoryNote: text("regulatory_note"),
    regulatorySimulated: boolean("regulatory_simulated").notNull().default(false),
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
    check("product_net_quantity", sql`${t.netQuantity} > 0`),
    check("product_shelf_life", sql`${t.shelfLifeDays} between 1 and 7300`),
  ],
);

export const packagingVersions = pgTable(
  "packaging_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    version: integer("version").notNull(),
    unitType: text("unit_type").notNull(),
    unitsPerCarton: integer("units_per_carton").notNull(),
    cartonsPerPallet: integer("cartons_per_pallet"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("packaging_product_version").on(t.productId, t.version),
    unique("packaging_tenant").on(t.id, t.manufacturerId),
    check("packaging_units_per_carton", sql`${t.unitsPerCarton} between 1 and 10000`),
    check("packaging_cartons_per_pallet", sql`${t.cartonsPerPallet} is null or ${t.cartonsPerPallet} between 1 and 10000`),
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
    cuisVersion: smallint("cuis_version"),
    cuisKeyVersion: smallint("cuis_key_version"),
    cuisRandomIdentity: bytea("cuis_random_identity"),
    cuisAuthTag: bytea("cuis_auth_tag"),
    cuisCredential: text("cuis_credential"),
    manufactureDate: date("manufacture_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    plannedQuantity: integer("planned_quantity").notNull(),
    packagingVersionId: uuid("packaging_version_id").references(() => packagingVersions.id),
    unitsPerCarton: integer("units_per_carton"),
    cartonCount: integer("carton_count"),
    looseUnits: integer("loose_units").notNull().default(0),
    productionNotes: text("production_notes"),
    batchGroupId: uuid("batch_group_id"),
    status: batchStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdByName: text("created_by_name").notNull().default("Unknown user"),
    createdByRole: text("created_by_role").notNull().default("Manufacturer user"),
    lastModifiedBy: uuid("last_modified_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    releasedBy: uuid("released_by").references(() => users.id),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseNote: text("release_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("batch_lot").on(t.productId, t.lot),
    uniqueIndex("batch_reference_tenant").on(t.manufacturerId, t.lot),
    index("batch_product_created").on(t.productId, t.createdAt),
    unique("batch_tenant").on(t.id, t.manufacturerId),
    foreignKey({ columns: [t.productId, t.manufacturerId], foreignColumns: [products.id, products.manufacturerId] }),
    foreignKey({
      columns: [t.lineId, t.factoryId, t.manufacturerId],
      foreignColumns: [productionLines.id, productionLines.factoryId, productionLines.manufacturerId],
    }),
    check("batch_dates", sql`${t.expiryDate} > ${t.manufactureDate}`),
    check("batch_quantity", sql`${t.plannedQuantity} between 1 and 100000`),
    uniqueIndex("batch_cuis_random_identity").on(t.cuisRandomIdentity),
    uniqueIndex("batch_cuis_credential").on(t.cuisCredential),
    check("batch_cuis_lengths", sql`(${t.cuisVersion} is null and ${t.cuisKeyVersion} is null and ${t.cuisRandomIdentity} is null and ${t.cuisAuthTag} is null and ${t.cuisCredential} is null) or (${t.cuisVersion} = 1 and ${t.cuisKeyVersion} > 0 and octet_length(${t.cuisRandomIdentity}) = 16 and octet_length(${t.cuisAuthTag}) = 16 and ${t.cuisCredential} is not null)`),
    check("batch_loose_units", sql`${t.looseUnits} >= 0`),
    check("batch_packaging_snapshot", sql`(${t.unitsPerCarton} is null and ${t.cartonCount} is null and ${t.looseUnits} = 0) or (${t.unitsPerCarton} > 0 and ${t.cartonCount} >= 0 and ${t.plannedQuantity} = (${t.unitsPerCarton} * ${t.cartonCount}) + ${t.looseUnits})`),
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

export const identityAllocations = pgTable(
  "identity_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    approvalRequestId: uuid("approval_request_id").notNull().references(() => approvalRequests.id),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestedQuantity: integer("requested_quantity").notNull(),
    issuedCount: integer("issued_count").notNull().default(0),
    status: allocationStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("identity_allocation_batch").on(t.batchId),
    uniqueIndex("identity_allocation_approval").on(t.approvalRequestId),
    uniqueIndex("identity_allocation_idempotency").on(t.idempotencyKey),
    index("identity_allocation_status").on(t.status, t.updatedAt),
    check("identity_allocation_quantity", sql`${t.requestedQuantity} > 0 and ${t.issuedCount} >= 0 and ${t.issuedCount} <= ${t.requestedQuantity}`),
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

export const exportJobs = pgTable(
  "export_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    requestedBy: uuid("requested_by").notNull().references(() => users.id),
    type: exportJobType("type").notNull(),
    status: exportJobStatus("status").notNull().default("queued"),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    recordCount: integer("record_count"),
    contentHash: varchar("content_hash", { length: 64 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [
    index("export_jobs_batch_time").on(t.batchId, t.createdAt),
    index("export_jobs_requester_time").on(t.requestedBy, t.createdAt),
  ],
);

export const cartons = pgTable(
  "cartons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    cartonIndex: integer("carton_index").notNull(),
    code: varchar("code", { length: 48 }).notNull().unique(),
    randomIdentity: bytea("random_identity").notNull().unique(),
    credential: text("credential").notNull().unique(),
    cuisVersion: smallint("cuis_version"),
    cuisKeyVersion: smallint("cuis_key_version"),
    cuisAuthTag: bytea("cuis_auth_tag"),
    cuisCredential: text("cuis_credential"),
    expectedUnits: integer("expected_units").notNull(),
    status: cartonStatus("status").notNull().default("reserved"),
    printedAt: timestamp("printed_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("carton_batch_position").on(t.batchId, t.cartonIndex),
    index("carton_batch_status").on(t.batchId, t.status),
    check("carton_expected_units", sql`${t.expectedUnits} > 0`),
    check("carton_random_length", sql`octet_length(${t.randomIdentity}) = 16`),
    uniqueIndex("carton_cuis_credential").on(t.cuisCredential),
    check("carton_cuis_lengths", sql`(${t.cuisVersion} is null and ${t.cuisKeyVersion} is null and ${t.cuisAuthTag} is null and ${t.cuisCredential} is null) or (${t.cuisVersion} = 1 and ${t.cuisKeyVersion} > 0 and octet_length(${t.cuisAuthTag}) = 16 and ${t.cuisCredential} is not null)`),
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
    cartonId: uuid("carton_id").references(() => cartons.id),
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
  cuisVersion: smallint("cuis_version"),
  cuisKeyVersion: smallint("cuis_key_version"),
  cuisAuthTag: bytea("cuis_auth_tag"),
  cuisPayload: text("cuis_payload").unique(),
  createdAt: createdAt(),
});

/** Non-secret metadata only. Key material remains behind the KMS provider interface. */
export const signingKeyMetadata = pgTable("signing_key_metadata", {
  version: smallint("version").primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  status: signingKeyStatus("status").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  verifyOnlyAt: timestamp("verify_only_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationReason: text("revocation_reason"),
});

/** Versioned non-secret signing-key registry. Protected key material remains in the KMS provider. */
export const signingKeys = pgTable(
  "signing_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyIdentifier: varchar("key_identifier", { length: 96 }).notNull().unique(),
    algorithm: authenticationAlgorithm("algorithm").notNull(),
    purpose: signingKeyPurpose("purpose").notNull(),
    keyVersion: smallint("key_version").notNull(),
    publicKey: bytea("public_key"),
    protectedKeyReference: text("protected_key_reference").notNull(),
    status: registryKeyStatus("status").notNull().default("pending"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("signing_key_purpose_version").on(t.algorithm, t.purpose, t.keyVersion),
    check("signing_key_version_positive", sql`${t.keyVersion} > 0`),
    check("signing_key_material_policy", sql`(${t.algorithm} = 'hmac_sha256' and ${t.publicKey} is null) or (${t.algorithm} = 'ed25519' and octet_length(${t.publicKey}) = 32)`),
  ],
);

/** Canonical credential registry. Subject typing is enforced by the three association tables below. */
export const cryptographicCredentials = pgTable(
  "cryptographic_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    credentialVersion: smallint("credential_version").notNull(),
    credentialType: credentialType("credential_type").notNull(),
    manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
    productId: uuid("product_variant_id").notNull(),
    batchId: uuid("batch_id").references(() => batches.id),
    randomIdentity: bytea("random_identity").notNull(),
    canonicalPayload: bytea("canonical_payload").notNull(),
    authenticationAlgorithm: authenticationAlgorithm("authentication_algorithm").notNull(),
    authenticationProof: bytea("authentication_proof").notNull(),
    signingKeyId: uuid("signing_key_id").notNull().references(() => signingKeys.id),
    credentialFingerprint: bytea("credential_fingerprint").notNull().unique(),
    issuanceStatus: credentialIssuanceStatus("issuance_status").notNull().default("issued"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("crypto_credential_random_namespace").on(t.manufacturerId, t.credentialType, t.randomIdentity),
    index("crypto_credential_subject_scope").on(t.manufacturerId, t.productId, t.batchId),
    index("crypto_credential_signing_key").on(t.signingKeyId),
    foreignKey({ columns: [t.productId, t.manufacturerId], foreignColumns: [products.id, products.manufacturerId] }),
    check("crypto_credential_version", sql`${t.credentialVersion} > 0`),
    check("crypto_random_length", sql`octet_length(${t.randomIdentity}) = 16`),
    check("crypto_fingerprint_length", sql`octet_length(${t.credentialFingerprint}) = 32`),
    check("crypto_proof_length", sql`(${t.authenticationAlgorithm} = 'hmac_sha256' and octet_length(${t.authenticationProof}) = 16) or (${t.authenticationAlgorithm} = 'ed25519' and octet_length(${t.authenticationProof}) = 64)`),
    check("crypto_batch_binding", sql`(${t.credentialType} = 'batch' and ${t.batchId} is null) or (${t.credentialType} in ('carton','unit') and ${t.batchId} is not null)`),
    check("crypto_revocation_state", sql`(${t.issuanceStatus} = 'issued' and ${t.revokedAt} is null) or (${t.issuanceStatus} = 'revoked' and ${t.revokedAt} is not null and ${t.revocationReason} is not null)`),
  ],
);

export const batchCredentialSubjects = pgTable("batch_credential_subjects", {
  credentialId: uuid("credential_id").primaryKey().references(() => cryptographicCredentials.id),
  batchId: uuid("batch_id").notNull().unique().references(() => batches.id),
  createdAt: createdAt(),
});

export const cartonCredentialSubjects = pgTable("carton_credential_subjects", {
  credentialId: uuid("credential_id").primaryKey().references(() => cryptographicCredentials.id),
  cartonId: uuid("carton_id").notNull().unique().references(() => cartons.id),
  createdAt: createdAt(),
});

export const unitCredentialSubjects = pgTable("unit_credential_subjects", {
  credentialId: uuid("credential_id").primaryKey().references(() => cryptographicCredentials.id),
  unitId: uuid("unit_id").notNull().unique().references(() => units.id),
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
    requestId: uuid("request_id").notNull().defaultRandom(),
    unitId: uuid("unit_id").references(() => units.id),
    batchId: uuid("batch_id").references(() => batches.id),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    credentialType: credentialType("credential_type"),
    credentialFingerprint: bytea("credential_fingerprint"),
    protocolVersion: smallint("protocol_version"),
    channel: channel("channel").notNull(),
    outcome: verificationOutcome("outcome").notNull(),
    cryptographicResult: cryptographicResult("cryptographic_result").notNull().default("unavailable"),
    registrationResult: registrationResult("registration_result").notNull().default("not_checked"),
    lifecycleResult: lifecycleResult("lifecycle_result").notNull().default("not_checked"),
    finalVerdict: verificationVerdict("final_verdict").notNull().default("verification_unavailable"),
    failureReasonCode: varchar("failure_reason_code", { length: 64 }),
    riskScore: smallint("risk_score"),
    region: varchar("region", { length: 2 }),
    deviceHash: bytea("device_hash"),
    signals: jsonb("signals").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("verification_request_id").on(t.requestId),
    index("verification_unit_time").on(t.unitId, t.createdAt),
    index("verification_time").on(t.createdAt),
    index("verification_fingerprint_time").on(t.credentialFingerprint, t.createdAt),
    check("verification_risk_score", sql`${t.riskScore} is null or ${t.riskScore} between 0 and 100`),
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

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    kind: varchar("kind", { length: 48 }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_unread").on(t.userId, t.readAt, t.createdAt)],
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
