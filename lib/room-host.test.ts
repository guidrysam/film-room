import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildViewerRoomUrl } from "./room-host";

describe("buildViewerRoomUrl", () => {
  it("includes watch-together query params", () => {
    assert.equal(
      buildViewerRoomUrl("https://app.example", "g-game1", "dQw4w9wgGcQ", {
        teamRoom: true,
        gameId: "game1",
        view: "sync",
      }),
      "https://app.example/room/g-game1?video=dQw4w9wgGcQ&view=sync&viewer=1&teamRoom=1&gameId=game1",
    );
  });
});
