import type { AcademyActivity } from "@/lib/academy/types";

export type AcademyYouTubeSuggestion = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  watchUrl: string;
  embedUrl: string;
};

/**
 * Deterministic YouTube search query for an Academy activity.
 * Uses title, age band, and authored search tags — no AI.
 */
export function buildAcademyActivityYouTubeQuery(
  activity: Pick<
    AcademyActivity,
    "title" | "ageBands" | "searchTags" | "category" | "activityType"
  >,
): string {
  const age = activity.ageBands[0]?.replaceAll("-", " ") ?? "youth";
  const tags = activity.searchTags.slice(0, 4).join(" ");
  const category = activity.category.replaceAll("_", " ");
  return [
    "youth soccer",
    age,
    activity.title,
    category,
    "drill",
    tags,
  ]
    .filter(Boolean)
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();
}
