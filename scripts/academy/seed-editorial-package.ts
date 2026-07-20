import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import { seedOpenBodyEditorialPackage } from "../../lib/academy/editorial-repository";
import { ensureAcademyDirectories } from "./_shared";

async function main(): Promise<void> {
  requireAcademyEditor();
  await ensureAcademyDirectories();
  const records = await seedOpenBodyEditorialPackage();
  console.log(
    `Seeded ${records.length} editorial records for the open-body package (needs_coach_review).`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy editorial seed failed.", error);
  process.exitCode = 1;
});
