export type Role = 'admin' | 'accountant' | 'delegate' | 'health';

export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  CACHE: KVNamespace;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  DATA_KEY: string;
  BLIND_KEY: string;
  ENVIRONMENT: string;
  CURRENCY: string;
  LOGIN_LIMITER?: Limiter;
  API_LIMITER?: Limiter;
}

export interface SessionUser {
  id: number;
  role: Role;
  /** The user's foundation. Every query scopes by this; it never comes from the request. */
  foundation: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser; d1Read: number; d1Written: number };
};
