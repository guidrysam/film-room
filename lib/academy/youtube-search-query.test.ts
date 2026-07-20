import assert from "node:assert/strict";
import test from "node:test";
import { buildAcademyActivityYouTubeQuery } from "@/lib/academy/youtube-search-query";

test("builds a deterministic youth-soccer search query from activity metadata", () => {
  const query = buildAcademyActivityYouTubeQuery({
    title: "Open-Body Gate Check",
    ageBands: ["U11-U12"],
    category: "warmup",
    activityType: "warmup",
    searchTags: ["receiving", "open body", "half turn", "first touch", "pairs"],
  });
  assert.equal(
    query,
    "youth soccer U11 U12 Open-Body Gate Check warmup drill receiving open body half turn first touch",
  );
});
