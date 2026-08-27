import "dotenv/config";
import { indexAllProducts } from "../services/embeddingService.js";
import prisma from "@intentflow/database";

async function main() {
  console.log("Starting product embedding indexer...");
  const startTime = Date.now();

  try {
    const result = await indexAllProducts();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("------------------------------------------");
    console.log(`Indexing complete in ${duration}s`);
    console.log(`Total Products : ${result.total}`);
    console.log(`Newly Indexed  : ${result.indexed}`);
    console.log(`Skipped (Same) : ${result.skipped}`);
    console.log(`Failed         : ${result.failed}`);
    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach((e) => console.log(` - Product ${e.productId}: ${e.error}`));
    }
    console.log("------------------------------------------");
  } catch (err) {
    console.error("Fatal error during indexing:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
