import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables (ensure DB connection vars are set)
dotenv.config({ path: '.env' });

// Configure the pool (similar to src/index.ts, but separate instance for the script)
const seedPool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,    
  connectionTimeoutMillis: 5000,
});

seedPool.on('error', (err) => {
  console.error('[seed script]: Unexpected error on idle client', err);
  process.exit(-1);
});

async function seedDatabase() {
  console.log('[seed script]: Starting database seeding...');
  const client = await seedPool.connect();
  console.log('[seed script]: Connected to database.');

  try {
    await client.query('BEGIN');
    console.log('[seed script]: Transaction started.');

    // --- Create Teams ---
    console.log('[seed script]: Inserting teams...');
    const teamAlphaRes = await client.query(
      `INSERT INTO teams (team_name, description, batch_size) VALUES ($1, $2, $3) RETURNING team_id`,
      ['Team Alpha', 'Handles US and CA events', 10]
    );
    const teamBetaRes = await client.query(
      `INSERT INTO teams (team_name, description, batch_size) VALUES ($1, $2, $3) RETURNING team_id`,
      ['Team Beta', 'Handles EU events', 5]
    );
    const teamAlpha = teamAlphaRes.rows[0];
    const teamBeta = teamBetaRes.rows[0];
    console.table([teamAlpha, teamBeta]);

    // --- Create Users ---
    console.log('[seed script]: Inserting users...');
    // User for Team Alpha
    const user1Res = await client.query(
      `INSERT INTO users (username, email, team_id, display_name) VALUES ($1, $2, $3, $4) RETURNING user_id`,
      ['alice_a', 'alice@example.com', teamAlpha.team_id, 'Alice Alpha']
    );
    // User for Team Beta
    const user2Res = await client.query(
      `INSERT INTO users (username, email, team_id, display_name) VALUES ($1, $2, $3, $4) RETURNING user_id`,
      ['bob_b', 'bob@example.com', teamBeta.team_id, 'Bob Beta']
    );
     // Another user for Team Alpha
     const user3Res = await client.query(
        `INSERT INTO users (username, email, team_id, display_name) VALUES ($1, $2, $3, $4) RETURNING user_id`,
        ['charlie_a', 'charlie@example.com', teamAlpha.team_id, 'Charlie Alpha']
      );
    const userAlice = user1Res.rows[0];
    const userBob = user2Res.rows[0];
    const userCharlie = user3Res.rows[0];
    console.table([userAlice, userBob, userCharlie]);

    // --- Assign Regions to Teams ---
    console.log('[seed script]: Assigning regions to teams...');
    await client.query(
      `INSERT INTO team_regions (team_id, region_code) VALUES ($1, $2), ($1, $3)`,
      [teamAlpha.team_id, 'us-east-1', 'ca-central-1']
    );
    await client.query(
      `INSERT INTO team_regions (team_id, region_code) VALUES ($1, $2), ($1, $3)`,
      [teamBeta.team_id, 'eu-west-1', 'eu-central-1']
    );
    console.log('[seed script]: Assigned regions.');

    // --- (Optional) Create some initial 'Pending' events ---
    console.log('[seed script]: Inserting sample events...');
     await client.query(
        `INSERT INTO events (region_code, external_event_id, event_payload, status) VALUES
         ($1, $2, $3, 'Pending'),
         ($4, $5, $6, 'Pending'),
         ($7, $8, $9, 'Pending')`,
        [
            'us-east-1', 'ext-001', '{"type": "test", "data": "abc"}',
            'ca-central-1', 'ext-002', '{"type": "test", "data": "def"}',
            'eu-west-1', 'ext-003', '{"type": "test", "data": "ghi"}'
        ]
    );
    console.log('[seed script]: Inserted sample events.');


    await client.query('COMMIT');
    console.log('[seed script]: Transaction committed.');

  } catch (err) {
    console.error('[seed script]: Error during seeding, rolling back transaction:', err);
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    console.log('[seed script]: Database client released.');
  }
}

// Run the seeding function and exit
seedDatabase()
  .then(() => {
    console.log('[seed script]: Database seeding completed successfully.');
    seedPool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed script]: Database seeding failed:', err);
    seedPool.end();
    process.exit(1);
  });