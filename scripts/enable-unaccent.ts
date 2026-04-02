import { Pool } from 'pg';
import 'dotenv/config';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
  console.log('unaccent extension enabled');
  // Test
  const { rows } = await pool.query("SELECT unaccent('Γλαράκη') as result");
  console.log('Test:', rows[0].result);
}
main().finally(() => pool.end());
