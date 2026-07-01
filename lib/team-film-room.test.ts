import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameTimelineEvent, GameVideoSource } from "./games";
import {
  teamFilmRoomId,
  teamFilmRoomRoute,
  buildTeamFilmRoomNavigateUrl,
  timelineEventToFilmRoomChapter,
  timelineEventsToFilmRoomChapters,
} from "./team-film-room";

function source(
  id: string,
  videoId: string,
  offset = 0,
): GameVideoSource {
  return {
    id,
    kind: "youtube",
    label: id,
    videoId,
    offsetFromGameTime: offset,
    syncStatus: "manually_synced",
  };
}

function event(
  partial: Pick<GameTimelineEvent, "id" | "type" | "t"> &
    Partial<GameTimelineEvent>,
): GameTimelineEvent {
  return {
    label: partial.label,
    sourceId: partial.sourceId,
    payload: partial.payload,
    ...partial,
  };
}

describe("teamFilmRoomId", () => {
  it("prefixes game id with g-", () => {
    assert.equal(teamFilmRoomId("abc123"), "g-abc123");
  });
});

describe("teamFilmRoomRoute", () => {
  it("builds entry route with optional viewer and reel params", () => {
    assert.equal(teamFilmRoomRoute("g1"), "/game/g1/room");
    assert.equal(
      teamFilmRoomRoute("g1", { viewer: true }),
      "/game/g1/room?viewer=1",
    );
    assert.equal(
      teamFilmRoomRoute("g1", { reelId: "reel-1" }),
      "/game/g1/room?reel=reel-1",
    );
  });
});

describe("buildTeamFilmRoomNavigateUrl", () => {
  it("includes teamRoom, gameId, and sync view for multi-angle", () => {
    const url = buildTeamFilmRoomNavigateUrl(
      "g-game1",
      "game1",
      "vid11111111",
      true,
      { viewer: true, reelId: "r1" },
    );
    assert.match(url, /^\/room\/g-game1\?/);
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("video"), "vid11111111");
    assert.equal(qs.get("view"), "sync");
    assert.equal(qs.get("gameId"), "game1");
    assert.equal(qs.get("teamRoom"), "1");
    assert.equal(qs.get("viewer"), "1");
    assert.equal(qs.get("reel"), "r1");
  });

  it("includes sync view for single-angle team rooms", () => {
    const url = buildTeamFilmRoomNavigateUrl(
      "g-game1",
      "game1",
      "vid11111111",
      false,
    );
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("view"), "sync");
    assert.equal(qs.get("teamRoom"), "1");
  });
});

describe("timelineEventToFilmRoomChapter", () => {
  it("maps game time to source playback time using source offset", () => {
    const sources = [source("cam-a", "aaaaaaaaaaa", 30)];
    const ch = timelineEventToFilmRoomChapter(
      event({
        id: "e1",
        type: "coach_mark",
        t: 120,
        label: "Corner",
        sourceId: "cam-a",
      }),
      sources,
    );
    assert.ok(ch);
    assert.equal(ch!.gameTime, 120);
    assert.equal(ch!.time, 150);
    assert.equal(ch!.videoId, "aaaaaaaaaaa");
    assert.equal(ch!.label, "Corner");
  });

  it("includes stat events with formatted labels", () => {
    const sources = [source("cam-a", "aaaaaaaaaaa", 0)];
    const ch = timelineEventToFilmRoomChapter(
      event({
        id: "e2",
        type: "stat",
        t: 90,
        label: "goal",
        sourceId: "cam-a",
        payload: { statType: "goal" },
      }),
      sources,
    );
    assert.ok(ch);
    assert.equal(ch!.label, "Goal");
  });
});

describe("timelineEventsToFilmRoomChapters", () => {
  it("sorts chapters by game time", () => {
    const sources = [
      source("cam-a", "aaaaaaaaaaa", 0),
      source("cam-b", "bbbbbbbbbbb", 10),
    ];
    const angles = [
      { id: "cam-a", name: "A", videoId: "aaaaaaaaaaa" },
      { id: "cam-b", name: "B", videoId: "bbbbbbbbbbb", offsetFromGameTime: 10 },
    ];
    const chapters = timelineEventsToFilmRoomChapters(
      [
        event({ id: "e3", type: "tag", t: 200, label: "Late", sourceId: "cam-b" }),
        event({ id: "e1", type: "coach_mark", t: 50, label: "Early", sourceId: "cam-a" }),
      ],
      sources,
      angles,
    );
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0]!.label, "Early");
    assert.equal(chapters[1]!.label, "Late");
  });
});
