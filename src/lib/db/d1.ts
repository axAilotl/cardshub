/**
 * Cloudflare D1 Database Adapter
 * Provides async database operations compatible with D1
 */

// D1 binding type
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  error?: string;
  meta?: {
    duration: number;
    changes: number;
    last_row_id: number;
    served_by: string;
  };
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

// Get D1 binding from request context (via getRequestContext from next-on-pages)
let d1Instance: D1Database | null = null;

export function setD1(db: D1Database) {
  d1Instance = db;
}

export function getD1(): D1Database {
  if (!d1Instance) {
    throw new Error('D1 database not initialized. Call setD1() first or ensure running in Cloudflare Workers environment.');
  }
  return d1Instance;
}

/**
 * Async database wrapper that works with D1
 */
export class AsyncDatabase {
  constructor(private db: D1Database) {}

  async prepare(query: string) {
    return new AsyncStatement(this.db.prepare(query));
  }

  async exec(query: string): Promise<void> {
    await this.db.exec(query);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // D1 doesn't support explicit transactions in the same way
    // but batch operations are atomic
    return fn();
  }
}

export class AsyncStatement {
  constructor(private stmt: D1PreparedStatement) {}

  bind(...values: unknown[]): AsyncStatement {
    return new AsyncStatement(this.stmt.bind(...values));
  }

  async get<T = unknown>(): Promise<T | null> {
    return this.stmt.first<T>();
  }

  async all<T = unknown>(): Promise<T[]> {
    const result = await this.stmt.all<T>();
    return result.results;
  }

  async run(): Promise<{ changes: number; lastInsertRowid: number }> {
    const result = await this.stmt.run();
    return {
      changes: result.meta?.changes ?? 0,
      lastInsertRowid: result.meta?.last_row_id ?? 0,
    };
  }
}

export function createAsyncDb(d1: D1Database): AsyncDatabase {
  return new AsyncDatabase(d1);
}
