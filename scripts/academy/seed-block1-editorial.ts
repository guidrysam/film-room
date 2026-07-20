import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import { seedBlock1EditorialPackages } from "../../lib/academy/editorial-repository";
import { ensureAcademyDirectories } from "./_shared";

async function main(): Promise<void> {
  requireAcademyEditor();
  await ensureAcademyDirectories();
  const records = await seedBlock1EditorialPackages();
  const packageCount = records.filter(
    (record) => record.objectType === "lesson_package",
  ).length;
  console.log(
    `Seeded ${records.length} editorial records across ${packageCount} Block 1 packages (needs_coach_review).`,
  );
  console.log(
    "Packages: academy-package-ball-available, academy-package-turn-escape, academy-package-shield-purpose",
  );
  console.log("Do not publish until coach review is complete.");
}

main().catch((error: unknown) => {
  console.error("Academy Block 1 editorial seed failed.", error);
  process.exitCode = 1;
});
