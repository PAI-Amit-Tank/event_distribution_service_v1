/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
    // Enable uuid-ossp extension if not already enabled
    pgm.createExtension('uuid-ossp', { ifNotExists: true });
  
    // Create teams table
    pgm.createTable('teams', {
      team_id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
      team_name: { type: 'varchar(100)', notNull: true, unique: true },
      description: { type: 'text' },
      batch_size: { type: 'integer', notNull: true, default: 10 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    });
  
    // Create users table
    pgm.createTable('users', {
      user_id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
      username: { type: 'varchar(100)', notNull: true, unique: true },
      email: { type: 'varchar(255)', unique: true },
      team_id: {
        type: 'uuid',
        references: 'teams(team_id)',
        onDelete: 'SET NULL',
      },
      display_name: { type: 'varchar(255)' },
      is_active: { type: 'boolean', notNull: true, default: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    });
  
    // Create team_regions table (junction table)
    pgm.createTable('team_regions', {
      team_id: {
        type: 'uuid',
        notNull: true,
        references: 'teams(team_id)',
        onDelete: 'CASCADE',
        primaryKey: true,
      },
      region_code: { type: 'varchar(50)', notNull: true, primaryKey: true }, // Part of composite key
      assigned_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    });
  
    // Create events table
    pgm.createTable('events', {
      event_id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
      external_event_id: { type: 'varchar(255)' },
      region_code: { type: 'varchar(50)', notNull: true },
      event_payload: { type: 'jsonb', notNull: true,  comment: 'Stores non-sensitive metadata or a reference to the full regional event payload.' },
      status: { type: 'varchar(20)', notNull: true },
      assigned_user_id: { type: 'uuid', references: 'users(user_id)', onDelete: 'SET NULL' },
      assigned_at: { type: 'timestamptz' },
      completed_at: { type: 'timestamptz' },
      review_user_id: { type: 'uuid', references: 'users(user_id)', onDelete: 'SET NULL' },
      reviewed_at: { type: 'timestamptz' },
      review_decision: { type: 'varchar(10)' },
      review_comment: { type: 'text' },
      ingested_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    });
  
    // Add CHECK constraints
    pgm.addConstraint('events', 'events_status_check', { check: "status IN ('Pending', 'Assigned', 'Completed')" });
    pgm.addConstraint('events', 'events_review_decision_check', { check: "review_decision IN ('Approved', 'Rejected') OR review_decision IS NULL" });
  
  
    // Create indexes
    pgm.createIndex('events', 'status');
    pgm.createIndex('events', 'region_code');
    pgm.createIndex('events', 'assigned_user_id');
    pgm.createIndex('events', 'assigned_at');
    pgm.createIndex('events', 'external_event_id');
  };
  
  /**
   * @param {import("node-pg-migrate").MigrationBuilder} pgm
   */
  exports.down = (pgm) => {
    pgm.dropTable('events');
    pgm.dropTable('team_regions');
    pgm.dropTable('users');
    pgm.dropTable('teams');
  };
  