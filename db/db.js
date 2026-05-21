import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

console.log("DATABASE_URL:", process.env.DATABASE_URL ? "있음" : "없음");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;