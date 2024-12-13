import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./src/db/schema";
import { seed } from "drizzle-seed";

config({ path: ".dev.vars" });

// Initialize the database connection
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seedDatabase() {
  // Seed the database with user data
  await seed(db, schema);
}

async function main() {
  try {
    await seedDatabase();
    console.log("✅ Database seeded successfully!");
    console.log("🦆 Run `npm run fiberplane` to explore data with your API.");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
