import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canReadParentInviteTarget,
  combineParentInviteMessages,
  eventInviteEmailMessage,
  findParentTargetsToLink,
  normalizePhoneForSms,
  parentInviteMailtoUrl,
  parentInviteMessage,
  parentInviteSmsUrl,
  parentInviteStatusLabel,
  parentTargetsEligibleForInvite,
  summarizeParentVideoTeam,
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
    const msg = parentInviteMessage(
      "Jane Smith",
      "U14 Wolves",
      "https://app/join/team/code",
    );
    assert.match(msg, /Hi Jane Smith/);
    assert.match(msg, /U14 Wolves on Film Room/);
    assert.match(msg, /upload game video/);
    assert.match(msg, /https:\/\/app\/join\/team\/code/);
    assert.match(msg, /Game Cap/);
  });

  it("combineParentInviteMessages joins multiple messages", () => {
    const combined = combineParentInviteMessages(["Message one", "Message two"]);
    assert.match(combined, /Message one/);
    assert.match(combined, /---/);
    assert.match(combined, /Message two/);
  });

  it("parentInviteMailtoUrl builds mailto link", () => {
    const url = parentInviteMailtoUrl(
      "jane@example.com",
      "Jane Smith",
      "U14 Wolves",
      "https://app/join/team/code",
    );
    assert.match(url, /^mailto:jane%40example.com\?subject=/);
    assert.match(url, /body=/);
  });

  it("parentInviteSmsUrl builds sms link when phone is valid", () => {
    const url = parentInviteSmsUrl(
      "(555) 123-4567",
      "Jane Smith",
      "U14 Wolves",
      "https://app/join/team/code",
    );
    assert.ok(url);
    assert.match(url!, /^sms:/);
    assert.match(url!, /body=/);
  });

  it("normalizePhoneForSms rejects too-short numbers", () => {
    assert.equal(normalizePhoneForSms("123"), null);
  });

  it("eventInviteEmailMessage includes join url", () => {
    const msg = eventInviteEmailMessage(
      "Labor Day Cup",
      "https://app/join/staff/x",
      "parent",
    );
    assert.match(msg, /Labor Day Cup/);
    assert.match(msg, /https:\/\/app\/join\/staff\/x/);
  });

  it("summarizeParentVideoTeam counts roster and statuses", () => {
    const summary = summarizeParentVideoTeam(
      12,
      [
        target({ id: "a", parentName: "A", email: "a@example.com", status: "invited" }),
        target({ id: "b", parentName: "B", email: "b@example.com", status: "joined" }),
        target({ id: "c", parentName: "C", email: "c@example.com", status: "ignored" }),
      ],
      { coach: "admin", parent1: "parent", parent2: "parent" },
    );
    assert.equal(summary.playersImported, 12);
    assert.equal(summary.parentContactsImported, 3);
    assert.equal(summary.parentsInvited, 1);
    assert.equal(summary.parentsJoined, 1);
    assert.equal(summary.videoContributors, 2);
  });

  it("parentTargetsEligibleForInvite excludes joined and ignored", () => {
    const eligible = parentTargetsEligibleForInvite([
      target({ id: "a", parentName: "A", email: "a@example.com", status: "not_invited" }),
      target({ id: "b", parentName: "B", email: "b@example.com", status: "invited" }),
      target({ id: "c", parentName: "C", email: "c@example.com", status: "joined" }),
      target({ id: "d", parentName: "D", email: "d@example.com", status: "ignored" }),
    ]);
    assert.deepEqual(
      eligible.map((row) => row.id),
      ["a", "b"],
    );
  });

  it("parentInviteStatusLabel covers statuses", () => {
    assert.equal(parentInviteStatusLabel("not_invited"), "Not invited");
    assert.equal(parentInviteStatusLabel("joined"), "Joined");
    assert.equal(parentInviteStatusLabel(undefined), "Not invited");
  });
});
