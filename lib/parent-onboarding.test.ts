import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canReadParentInviteTarget,
  findParentTargetsToLink,
  parentInviteMessage,
  parentInviteStatusLabel,
} from "./parent-onboarding";
import type { ParentInviteTarget } from "./parent-invite-targets";

function target(
  partial: Partial<ParentInviteTarget> & Pick<ParentInviteTarget, "id" | "email" | "parentName">,
): ParentInviteTarget {
  return {
    status: "not_invited",
    ...partial,
  };
}

describe("parent-onboarding", () => {
  it("findParentTargetsToLink matches email", () => {
    const targets = [
      target({
        id: "t1",
        parentName: "Jane Smith",
        email: "jane@example.com",
        playerId: "p1",
        playerName: "Alex",
      }),
    ];
    const matched = findParentTargetsToLink(targets, "Jane@Example.com");
    assert.equal(matched.length, 1);
    assert.equal(matched[0]!.id, "t1");
  });

  it("findParentTargetsToLink matches invite code", () => {
    const targets = [
      target({
        id: "t2",
        parentName: "Bob",
        email: "bob@example.com",
        inviteCode: "abc123",
        status: "invited",
      }),
    ];
    const matched = findParentTargetsToLink(targets, undefined, "abc123");
    assert.equal(matched.length, 1);
    assert.equal(matched[0]!.id, "t2");
  });

  it("skips ignored and already joined targets", () => {
    const targets = [
      target({
        id: "t3",
        parentName: "Ignored",
        email: "x@example.com",
        status: "ignored",
      }),
      target({
        id: "t4",
        parentName: "Joined",
        email: "y@example.com",
        status: "joined",
        joinedUid: "uid-1",
      }),
    ];
    assert.equal(findParentTargetsToLink(targets, "x@example.com").length, 0);
    assert.equal(findParentTargetsToLink(targets, "y@example.com").length, 0);
  });

  it("canReadParentInviteTarget allows coaches and matched parents only", () => {
    const t = target({
      id: "t5",
      parentName: "Pat",
      email: "pat@example.com",
      joinedUid: "parent-uid",
      status: "joined",
    });
    assert.equal(canReadParentInviteTarget("coach-uid", true, t), true);
    assert.equal(canReadParentInviteTarget("parent-uid", false, t), true);
    assert.equal(canReadParentInviteTarget("other-parent", false, t), false);
  });

  it("parentInviteMessage formats copy template", () => {
    const msg = parentInviteMessage("U14 Wolves", "https://app/join/team/code");
    assert.match(msg, /Join our Film Room team/);
    assert.match(msg, /https:\/\/app\/join\/team\/code/);
  });

  it("parentInviteStatusLabel covers statuses", () => {
    assert.equal(parentInviteStatusLabel("not_invited"), "Not invited");
    assert.equal(parentInviteStatusLabel("joined"), "Joined");
    assert.equal(parentInviteStatusLabel(undefined), "Not invited");
  });
});
