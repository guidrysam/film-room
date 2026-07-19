import assert from "node:assert/strict";
import test from "node:test";
import {
  sourceIdFromFilename,
  sourceTitleFromFilename,
} from "@/lib/academy/source-ids";

test("creates stable lowercase source ids from PDF filenames", () => {
  assert.equal(
    sourceIdFromFilename("51Shooting_Drills.pdf"),
    "51shooting-drills",
  );
  assert.equal(
    sourceIdFromFilename("Canning City Curriculum 2017 — U14 to U18.PDF"),
    "canning-city-curriculum-2017-u14-to-u18",
  );
  assert.equal(sourceIdFromFilename("../PDP-1-Booklet.pdf"), "pdp-1-booklet");
});

test("creates a readable private registry title", () => {
  assert.equal(
    sourceTitleFromFilename("Warm-up_exercises-with-ball.pdf"),
    "Warm up exercises with ball",
  );
});
