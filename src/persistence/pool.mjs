import pg from 'pg';

export function createPool(connectionString, options = {}) {
  if (!connectionString) failEnv('Database URL is required');
  return new pg.Pool({ connectionString, max: options.max ?? 10 });
}

export function createClient(connectionString) {
  if (!connectionString) failEnv('Database URL is required');
  return new pg.Client({ connectionString });
}

const failEnv = message => {
  const error = new Error(message);
  error.code = 'CONFIG';
  throw error;
};
