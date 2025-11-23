import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = postgres(connectionString, {
  max: 10,              // Maximum number of connections
  idle_timeout: 20,     // Close idle connections after 20 seconds
  connect_timeout: 10,  // Timeout connection attempts after 10 seconds
});

console.log('✅ Connected to Supabase DB');

export default sql;