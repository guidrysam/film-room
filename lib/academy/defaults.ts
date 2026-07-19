import type { AcademyEditorialMetadata } from "@/lib/academy/types";

export const DEFAULT_DRAFT_EDITORIAL_METADATA: Readonly<AcademyEditorialMetadata> =
  Object.freeze({
    status: "draft",
    originalWording: true,
    originalDiagram: true,
    generatedWithAssistance: true,
  });
