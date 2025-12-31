/**
 * Test database helper using pg-mem for in-memory PostgreSQL
 */

import { newDb, IMemoryDb, DataType } from 'pg-mem';
import { Pool, PoolClient } from 'pg';
import { Campaign } from '../../src/types';

/**
 * Test database class
 */
export class TestDatabase {
  private db: IMemoryDb;
  private pool: Pool | null = null;

  constructor() {
    this.db = newDb();
    this.setupExtensions();
  }

  /**
   * Setup PostgreSQL extensions
   */
  private setupExtensions(): void {
    // Register extensions that might be needed
    this.db.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'test',
    });

    this.db.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 13.0 (pg-mem)',
    });
  }

  /**
   * Initialize database schema
   */
  public async initializeSchema(): Promise<void> {
    await this.db.public.none(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        status VARCHAR(50) NOT NULL,
        budget DECIMAL(15, 2) NOT NULL,
        impressions INTEGER NOT NULL,
        clicks INTEGER NOT NULL,
        conversions INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL,
        synced_at TIMESTAMP NOT NULL,
        CONSTRAINT campaigns_status_check CHECK (status IN ('active', 'paused', 'completed'))
      );

      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_synced_at ON campaigns(synced_at DESC);
    `);
  }

  /**
   * Get pg Pool adapter
   */
  public getPool(): Pool {
    if (!this.pool) {
      this.pool = this.db.adapters.createPg().Pool as unknown as Pool;
    }
    return this.pool;
  }

  /**
   * Get raw pg-mem database
   */
  public getDb(): IMemoryDb {
    return this.db;
  }

  /**
   * Execute query
   */
  public async query<T = unknown>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }> {
    let result;
    if (params && params.length > 0) {
      // Simple interpolation for test purposes; beware of SQL injection in production code!
      let interpolated = text;
      params.forEach((param, idx) => {
        const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
        interpolated = interpolated.replace(new RegExp(`\\$${idx + 1}\\b`, 'g'), value as string);
      });
      result = await this.db.public.many(interpolated);
    } else {
      result = await this.db.public.many(text);
    }

    return {
      rows: result as T[],
      rowCount: result.length,
    };
  }

  /**
   * Insert test campaign
   */
  public async insertCampaign(campaign: Campaign): Promise<void> {
    await this.db.public.none(
      `INSERT INTO campaigns (id, name, status, budget, impressions, clicks, conversions, created_at, synced_at)
       VALUES ('${campaign.id}', '${campaign.name}', '${campaign.status}', ${campaign.budget}, ${campaign.impressions}, ${campaign.clicks}, ${campaign.conversions}, '${campaign.created_at}', NOW())`
    );
  }

  /**
   * Insert multiple campaigns
   */
  public async insertCampaigns(campaigns: Campaign[]): Promise<void> {
    for (const campaign of campaigns) {
      await this.insertCampaign(campaign);
    }
  }

  /**
   * Get campaign by ID
   */
  public async getCampaign(id: string): Promise<Campaign | null> {
    // Interpolate parameter for pg-mem
    const interpolated = 'SELECT * FROM campaigns WHERE id = ' + `'${id.replace(/'/g, "''")}'`;
    const result = await this.db.public.many(interpolated);

    return result.length > 0 ? (result[0] as Campaign) : null;
  }

  /**
   * Get all campaigns
   */
  public async getAllCampaigns(): Promise<Campaign[]> {
    const result = await this.db.public.many('SELECT * FROM campaigns ORDER BY id');
    return result as Campaign[];
  }

  /**
   * Count campaigns
   */
  public async countCampaigns(): Promise<number> {
    const result = await this.db.public.one('SELECT COUNT(*) as count FROM campaigns');
    return parseInt((result as { count: string }).count, 10);
  }

  /**
   * Clear all campaigns
   */
  public async clearCampaigns(): Promise<void> {
    await this.db.public.none('TRUNCATE TABLE campaigns');
  }

  /**
   * Clear entire database
   */
  public async clear(): Promise<void> {
    await this.db.public.none('DROP TABLE IF EXISTS campaigns CASCADE');
  }

  /**
   * Backup database state
   */
  public backup(): unknown {
    return this.db.backup();
  }

  /**
   * Restore database state
   */
  public restore(backup: unknown): void {
    this.db.restore(backup);
  }

  /**
   * Check if table exists
   */
  public async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.db.public.one(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
        [tableName]
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get table row count
   */
  public async getTableRowCount(tableName: string): Promise<number> {
    const result = await this.db.public.one(`SELECT COUNT(*) as count FROM ${tableName}`);
    return parseInt((result as { count: string }).count, 10);
  }
}

/**
 * Create test database instance
 */
export function createTestDatabase(): TestDatabase {
  return new TestDatabase();
}

/**
 * Helper to setup and teardown test database in tests
 */
export function withTestDatabase() {
  const testDb = createTestDatabase();

  beforeAll(async () => {
    await testDb.initializeSchema();
  });

  afterAll(async () => {
    await testDb.clear();
  });

  beforeEach(async () => {
    await testDb.clearCampaigns();
  });

  return testDb;
}

/**
 * Create isolated test database for each test
 */
export function withIsolatedDatabase() {
  let testDb: TestDatabase;
  let backup: unknown;

  beforeEach(async () => {
    testDb = createTestDatabase();
    await testDb.initializeSchema();
    backup = testDb.backup();
  });

  afterEach(async () => {
    if (testDb && backup) {
      testDb.restore(backup);
    }
  });

  return {
    getDb: () => testDb,
  };
}