import pg from "pg";

// Share one connection pool across requests instead of opening a connection per query.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const q = (text, params) => pool.query(text, params).then((r) => r.rows);
export const one = (text, params) => q(text, params).then((r) => r[0]);
export default pool;
