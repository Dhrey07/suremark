import "./load-env";

import { Client } from "pg";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const passed: string[] = [];
  const mustReject = async (name: string, query: string, params: unknown[] = []) => {
    const savepoint = `test_${passed.length}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      await client.query(query, params);
      throw new Error(`${name} was unexpectedly accepted`);
    } catch (error) {
      if (error instanceof Error && error.message.endsWith("was unexpectedly accepted")) throw error;
      await client.query(`rollback to savepoint ${savepoint}`);
      passed.push(name);
    }
  };

  try {
    await client.query("begin");
    const integrity = await client.query<{ mismatches: number }>(`
      select count(*)::int as mismatches from (
        select c.id from cryptographic_credentials c join batch_credential_subjects s on s.credential_id=c.id join batches b on b.id=s.batch_id
        where c.credential_type <> 'batch' or c.manufacturer_id<>b.manufacturer_id or c.product_variant_id<>b.product_id
        union all
        select c.id from cryptographic_credentials c join carton_credential_subjects s on s.credential_id=c.id join cartons x on x.id=s.carton_id
        where c.credential_type <> 'carton' or c.batch_id<>x.batch_id or c.manufacturer_id<>x.manufacturer_id or c.product_variant_id<>x.product_id
        union all
        select c.id from cryptographic_credentials c join unit_credential_subjects s on s.credential_id=c.id join units u on u.id=s.unit_id
        where c.credential_type <> 'unit' or c.batch_id<>u.batch_id or c.manufacturer_id<>u.manufacturer_id or c.product_variant_id<>u.product_id
      ) mismatched
    `);
    if (integrity.rows[0]!.mismatches !== 0) throw new Error("Registry contains subject-scope mismatches");
    passed.push("all registered subjects match credential type and scope");

    await mustReject(
      "duplicate credential fingerprint",
      `insert into cryptographic_credentials (credential_version,credential_type,manufacturer_id,product_variant_id,batch_id,random_identity,canonical_payload,authentication_algorithm,authentication_proof,signing_key_id,credential_fingerprint,issuance_status,issued_at,created_at)
       select credential_version,credential_type,manufacturer_id,product_variant_id,batch_id,gen_random_bytes(16),canonical_payload,authentication_algorithm,authentication_proof,signing_key_id,credential_fingerprint,issuance_status,issued_at,created_at from cryptographic_credentials limit 1`,
    );
    await mustReject("issued credential reassignment", "update cryptographic_credentials set product_variant_id=(select id from products where id<>cryptographic_credentials.product_variant_id limit 1) where id=(select id from cryptographic_credentials limit 1)");

    const cross = await client.query<{ unit_id: string; carton_id: string }>(`
      select u.id unit_id, c.id carton_id from units u join cartons c on c.batch_id<>u.batch_id limit 1
    `);
    if (cross.rowCount) await mustReject("unit assigned to carton from another batch", "update units set carton_id=$1 where id=$2", [cross.rows[0]!.carton_id, cross.rows[0]!.unit_id]);

    const active = await client.query<{ id: string }>("select id from units where state='ACTIVE' limit 1");
    if (active.rowCount) await mustReject("invalid released-unit lifecycle reversal", "update units set state='RESERVED' where id=$1", [active.rows[0]!.id]);
    await mustReject("invalid signing-key lifecycle reversal", "update signing_keys set status='pending' where status='active' and id=(select id from signing_keys where status='active' limit 1)");

    await client.query("rollback");
    console.log(`credential registry database tests passed: ${passed.length}`);
    for (const name of passed) console.log(`- ${name}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

