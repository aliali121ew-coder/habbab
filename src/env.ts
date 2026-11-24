import type { Feature } from './lib/features';

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
  /** Requests sent from the public family link, per address. */
  APPLY_LIMITER?: Limiter;
  /** Public Mapbox token (pk.…) for the map and road routes; restricted to this site in Mapbox. */
  MAPBOX_TOKEN?: string;
}

export interface SessionUser {
  id: number;
  role: Role;
  /** The foundation being worked in. Every query scopes by this; it never comes from the request.
   *  For a system admin it is the foundation they entered; for everyone else, their own. */
  foundation: number;
  /** Features that foundation has switched on. */
  features: Feature[];
  /** مدير النظام: manages foundations and may enter any of them. */
  system: boolean;
  /** Token version, session start, and remember flag from the verified session token. */
  tokenVersion: number;
  sessionStart: number;
  remember: boolean;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser; d1Read: number; d1Written: number };
};
