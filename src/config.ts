import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port in ${name}`);
  }

  return value;
}

function jwtSecret(nodeEnv: string): string {
  const value = process.env.JWT_SECRET;

  if (value) return value;
  if (nodeEnv !== "production") return "development-only-jwt-secret";

  throw new Error("Missing required environment variable: JWT_SECRET");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: port("PORT", 3000),
  jwtSecret: jwtSecret(process.env.NODE_ENV ?? "development"),
  db: {
    host: required("DB_HOST"),
    port: port("DB_PORT", 5432),
    database: required("POSTGRES_DB"),
    user: required("POSTGRES_USER"),
    password: required("POSTGRES_PASSWORD")
  }
};
