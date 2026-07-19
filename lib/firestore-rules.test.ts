import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  arrayUnion,
  deleteField,
} from "firebase/firestore";

const RULES = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
const PROJECT_ID = "film-room-rules-test";
const HAS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeRules = HAS_EMULATOR ? describe : describe.skip;

let testEnv: RulesTestEnvironment | undefined;

describeRules("firestore rules (emulator)", () => {
  before(async () => {
    const [host, portRaw] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(
      ":",
    );
    const port = Number(portRaw ?? 8080);
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
        host,
        port,
      },
    });
  });

  beforeEach(async () => {
    await testEnv!.clearFirestore();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  async function seedTeam(teamId: string, uid: string) {
    await testEnv!.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "teams", teamId), {
        name: "Test Team",
        ownerId: uid,
        members: { [uid]: "admin" },
        memberUids: [uid],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  }

  async function seedGame(
    gameId: string,
    data: Record<string, unknown>,
  ) {
    await testEnv!.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "games", gameId), {
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ...data,
      });
    });
  }

  describe("team creation", () => {
    it("allows authenticated user to create a team", async () => {
      const uid = "coach-uid";
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        setDoc(doc(db, "teams", "team-1"), {
          name: "Test Team",
          ownerId: uid,
          members: { [uid]: "admin" },
          memberUids: [uid],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );
    });

    it("denies create when ownerId does not match auth uid", async () => {
      const db = testEnv!.authenticatedContext("coach-uid").firestore();

      await assertFails(
        setDoc(doc(db, "teams", "team-1"), {
          name: "Test Team",
          ownerId: "other-uid",
          members: { "other-uid": "admin" },
          memberUids: ["other-uid"],
        }),
      );
    });

    it("denies unauthenticated team create", async () => {
      const db = testEnv!.unauthenticatedContext().firestore();

      await assertFails(
        setDoc(doc(db, "teams", "team-1"), {
          name: "Test Team",
          ownerId: "coach-uid",
          members: { "coach-uid": "admin" },
          memberUids: ["coach-uid"],
        }),
      );
    });
  });

  describe("team query reads", () => {
    it("owner can query teams by memberUids", async () => {
      const uid = "coach-uid";
      await seedTeam("team-1", uid);
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        getDocs(
          query(collection(db, "teams"), where("memberUids", "array-contains", uid)),
        ),
      );
    });

    it("non-member cannot read team doc", async () => {
      await seedTeam("team-1", "coach-uid");
      const db = testEnv!.authenticatedContext("other-uid").firestore();

      await assertFails(getDoc(doc(db, "teams", "team-1")));
    });

    it("non-member cannot query another user teams", async () => {
      await seedTeam("team-1", "coach-uid");
      const db = testEnv!.authenticatedContext("other-uid").firestore();

      await assertFails(
        getDocs(
          query(
            collection(db, "teams"),
            where("memberUids", "array-contains", "coach-uid"),
          ),
        ),
      );
    });
  });

  describe("staff invite self-join", () => {
    it("coach can join via staff invite without reading team first", async () => {
      const adminUid = "admin-uid";
      const coachUid = "new-coach-uid";
      const teamId = "team-event-1";
      await seedTeam(teamId, adminUid);
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "staffInvites", "staff-code-1"), {
          code: "staff-code-1",
          teamIds: [teamId],
          eventLabel: "Labor Day Cup",
          role: "coach",
          createdBy: adminUid,
          active: true,
          createdAt: Timestamp.now(),
        });
      });

      const coachDb = testEnv!.authenticatedContext(coachUid).firestore();
      await assertFails(getDoc(doc(coachDb, "teams", teamId)));

      await assertSucceeds(
        updateDoc(doc(coachDb, "teams", teamId), {
          [`members.${coachUid}`]: "coach",
          memberUids: arrayUnion(coachUid),
          updatedAt: Timestamp.now(),
          joinCode: "staff-code-1",
        }),
      );

      await assertSucceeds(
        updateDoc(doc(coachDb, "teams", teamId), {
          joinCode: deleteField(),
        }),
      );

      await assertSucceeds(getDoc(doc(coachDb, "teams", teamId)));
    });
  });

  describe("team deletion", () => {
    it("owner can delete team with no games", async () => {
      const uid = "owner-uid";
      const teamId = "team-1";
      await seedTeam(teamId, uid);
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(deleteDoc(doc(db, "teams", teamId)));
    });

    it("non-owner admin cannot delete team", async () => {
      const teamId = "team-1";
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "teams", teamId), {
          name: "Test Team",
          ownerId: "owner-uid",
          members: { "owner-uid": "admin", "admin-uid": "admin" },
          memberUids: ["owner-uid", "admin-uid"],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });
      const db = testEnv!.authenticatedContext("admin-uid").firestore();

      await assertFails(deleteDoc(doc(db, "teams", teamId)));
    });

    it("owner can delete players and parent targets during cleanup", async () => {
      const uid = "owner-uid";
      const teamId = "team-1";
      await seedTeam(teamId, uid);
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "teams", teamId, "players", "p1"), {
          name: "Alex",
        });
        await setDoc(doc(adminDb, "teams", teamId, "parentInviteTargets", "t1"), {
          parentName: "Jane",
          email: "jane@example.com",
        });
        await setDoc(doc(adminDb, "teamInvites", "invite-1"), {
          code: "invite-1",
          teamId,
          teamName: "Test Team",
          role: "parent",
          createdBy: uid,
          active: true,
        });
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(deleteDoc(doc(db, "teams", teamId, "players", "p1")));
      await assertSucceeds(
        deleteDoc(doc(db, "teams", teamId, "parentInviteTargets", "t1")),
      );
      await assertSucceeds(deleteDoc(doc(db, "teamInvites", "invite-1")));
    });
  });

  describe("roster import", () => {
    it("allows team owner to create players and parent invite targets", async () => {
      const uid = "coach-uid";
      const teamId = "team-1";
      await seedTeam(teamId, uid);
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        setDoc(doc(db, "teams", teamId, "players", "player-1"), {
          name: "Alex Smith",
          jerseyNumber: "7",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );

      await assertSucceeds(
        setDoc(doc(db, "teams", teamId, "parentInviteTargets", "parent-1"), {
          parentName: "Jane Smith",
          email: "jane@example.com",
          playerId: "player-1",
          playerName: "Alex Smith",
          status: "not_invited",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );
    });
  });

  describe("game query reads", () => {
    it("contributor can query games by memberUids", async () => {
      const uid = "editor-uid";
      await seedGame("game-1", {
        title: "vs Hawks",
        ownerId: uid,
        contributors: { [uid]: "owner" },
        memberUids: [uid],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        getDocs(
          query(collection(db, "games"), where("memberUids", "array-contains", uid)),
        ),
      );
    });

    it("standalone game contributor can read own game", async () => {
      const uid = "editor-uid";
      await seedGame("game-1", {
        title: "vs Hawks",
        ownerId: uid,
        contributors: { [uid]: "editor" },
        memberUids: [uid],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-1")));
    });

    it("authenticated user can read public game", async () => {
      await seedGame("game-public", {
        title: "Public scrimmage",
        ownerId: "owner-uid",
        contributors: { "owner-uid": "owner" },
        memberUids: ["owner-uid"],
        visibility: "public",
      });
      const db = testEnv!.authenticatedContext("viewer-uid").firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-public")));
    });

    it("authenticated user can read link game", async () => {
      await seedGame("game-link", {
        title: "Link share",
        ownerId: "owner-uid",
        contributors: { "owner-uid": "owner" },
        memberUids: ["owner-uid"],
        visibility: "link",
      });
      const db = testEnv!.authenticatedContext("viewer-uid").firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-link")));
    });

    it("non-member cannot read private game", async () => {
      await seedGame("game-private", {
        title: "Private",
        ownerId: "owner-uid",
        contributors: { "owner-uid": "owner" },
        memberUids: ["owner-uid"],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext("other-uid").firestore();

      await assertFails(getDoc(doc(db, "games", "game-private")));
    });

    it("team member can read team-linked game without contributor entry", async () => {
      const coachUid = "coach-uid";
      const teamId = "team-1";
      await seedTeam(teamId, coachUid);
      await seedGame("game-team", {
        title: "Past game",
        ownerId: coachUid,
        contributors: { [coachUid]: "owner" },
        memberUids: [coachUid],
        teamId,
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(coachUid).firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-team")));
    });

    it("owner can list sources and events subcollections", async () => {
      const uid = "owner-uid";
      const gameId = "game-1";
      await seedGame(gameId, {
        title: "vs Hawks",
        ownerId: uid,
        contributors: { [uid]: "owner" },
        memberUids: [uid],
        visibility: "private",
      });
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "games", gameId, "sources", "src-1"), {
          kind: "youtube",
          label: "Main",
          videoId: "dQw4w9WgXcQ",
          gameOwnerId: uid,
          gameMemberUids: [uid],
        });
        await setDoc(doc(adminDb, "games", gameId, "events", "ev-1"), {
          type: "note",
          t: 0,
          gameOwnerId: uid,
          gameMemberUids: [uid],
        });
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(getDocs(collection(db, "games", gameId, "sources")));
      await assertSucceeds(getDocs(collection(db, "games", gameId, "events")));
      await assertSucceeds(getDoc(doc(db, "games", gameId, "sources", "src-1")));
    });

    it("owner can read source by id with parent denorm fallback", async () => {
      const uid = "owner-uid";
      const gameId = "game-src-get";
      await seedGame(gameId, {
        title: "vs Hawks",
        ownerId: uid,
        contributors: { [uid]: "owner" },
        memberUids: [uid],
        sourceIds: ["src-1"],
        visibility: "private",
      });
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "games", gameId, "sources", "src-1"),
          {
            kind: "youtube",
            label: "Main",
            videoId: "dQw4w9WgXcQ",
            gameOwnerId: uid,
            gameMemberUids: [uid],
          },
        );
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(getDoc(doc(db, "games", gameId, "sources", "src-1")));
    });

    it("requires memberUids on game create", async () => {
      const uid = "owner-uid";
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertFails(
        setDoc(doc(db, "games", "game-bad"), {
          title: "Missing memberUids",
          ownerId: uid,
          contributors: { [uid]: "owner" },
          visibility: "private",
        }),
      );
    });

    it("editor can update sourceIds index on game", async () => {
      const ownerUid = "owner-uid";
      const editorUid = "editor-uid";
      const gameId = "game-editor-index";
      await seedGame(gameId, {
        title: "Shared game",
        ownerId: ownerUid,
        contributors: { [ownerUid]: "owner", [editorUid]: "editor" },
        memberUids: [ownerUid, editorUid],
        sourceIds: [],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(editorUid).firestore();

      await assertSucceeds(
        updateDoc(doc(db, "games", gameId), {
          sourceIds: arrayUnion("src-1"),
          updatedAt: Timestamp.now(),
        }),
      );
    });

    it("owner can create source and update sourceIds index", async () => {
      const uid = "owner-uid";
      const gameId = "game-src-create";
      await seedGame(gameId, {
        title: "Cup final",
        ownerId: uid,
        contributors: { [uid]: "owner" },
        memberUids: [uid],
        sourceIds: [],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        setDoc(doc(db, "games", gameId, "sources", "src-new"), {
          id: "src-new",
          gameId,
          kind: "youtube",
          label: "Main",
          videoId: "dQw4w9WgXcQ",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          createdBy: uid,
          gameOwnerId: uid,
          gameMemberUids: [uid],
          createdAt: Timestamp.now(),
        }),
      );
      await assertSucceeds(
        updateDoc(doc(db, "games", gameId), {
          sourceIds: arrayUnion("src-new"),
          updatedAt: Timestamp.now(),
        }),
      );
    });

    it("team coach can create source on team game without contributor entry", async () => {
      const coachUid = "coach-uid";
      const ownerUid = "other-owner";
      const teamId = "team-src";
      const gameId = "game-team-src";
      await seedTeam(teamId, coachUid);
      await seedGame(gameId, {
        title: "Team game",
        ownerId: ownerUid,
        contributors: { [ownerUid]: "owner" },
        memberUids: [ownerUid],
        teamId,
        sourceIds: [],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(coachUid).firestore();

      await assertSucceeds(
        setDoc(doc(db, "games", gameId, "sources", "src-coach"), {
          id: "src-coach",
          gameId,
          kind: "youtube",
          label: "Parent cam",
          videoId: "dQw4w9WgXcQ",
          createdBy: coachUid,
          gameOwnerId: ownerUid,
          gameMemberUids: [ownerUid],
          gameTeamId: teamId,
          createdAt: Timestamp.now(),
        }),
      );
      await assertSucceeds(
        updateDoc(doc(db, "games", gameId), {
          sourceIds: arrayUnion("src-coach"),
          updatedAt: Timestamp.now(),
        }),
      );
    });
  });

  describe("tactics boards and steps", () => {
    it("coach can create board and step; parent cannot read", async () => {
      const coachUid = "coach-uid";
      const parentUid = "parent-uid";
      const teamId = "team-tactics";
      await seedTeam(teamId, coachUid);
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "teams", teamId), {
          members: {
            [coachUid]: "admin",
            [parentUid]: "parent",
          },
          memberUids: [coachUid, parentUid],
        });
      });

      const coachDb = testEnv!.authenticatedContext(coachUid).firestore();
      await assertSucceeds(
        setDoc(doc(coachDb, "teams", teamId, "tactics", "board-1"), {
          teamId,
          title: "Press",
          createdBy: coachUid,
          updatedBy: coachUid,
          sport: "soccer",
          version: 1,
          visibility: "team_coaches",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );
      await assertSucceeds(
        setDoc(doc(coachDb, "teams", teamId, "tactics", "board-1", "steps", "step-1"), {
          boardId: "board-1",
          order: 0,
          title: "Step 1",
          objects: [],
          version: 1,
          createdBy: coachUid,
          updatedBy: coachUid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );

      const parentDb = testEnv!.authenticatedContext(parentUid).firestore();
      await assertFails(
        getDoc(doc(parentDb, "teams", teamId, "tactics", "board-1")),
      );
      await assertFails(
        getDoc(
          doc(parentDb, "teams", teamId, "tactics", "board-1", "steps", "step-1"),
        ),
      );
    });

    it("step update requires version increment", async () => {
      const coachUid = "coach-uid";
      const teamId = "team-tactics-ver";
      await seedTeam(teamId, coachUid);
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "teams", teamId, "tactics", "b1"), {
          teamId,
          title: "Board",
          createdBy: coachUid,
          updatedBy: coachUid,
          sport: "soccer",
          version: 1,
          visibility: "team_coaches",
        });
        await setDoc(
          doc(context.firestore(), "teams", teamId, "tactics", "b1", "steps", "s1"),
          {
            boardId: "b1",
            order: 0,
            title: "Step 1",
            objects: [],
            version: 1,
            createdBy: coachUid,
            updatedBy: coachUid,
          },
        );
      });

      const db = testEnv!.authenticatedContext(coachUid).firestore();
      await assertFails(
        updateDoc(doc(db, "teams", teamId, "tactics", "b1", "steps", "s1"), {
          objects: [{ id: "p1", type: "ball", x: 0.5, y: 0.5 }],
          version: 1,
          updatedBy: coachUid,
        }),
      );
      await assertSucceeds(
        updateDoc(doc(db, "teams", teamId, "tactics", "b1", "steps", "s1"), {
          objects: [{ id: "p1", type: "ball", x: 0.5, y: 0.5 }],
          version: 2,
          updatedBy: coachUid,
          title: "Step 1",
          order: 0,
          boardId: "b1",
          createdBy: coachUid,
        }),
      );
    });

    it("another team coach can update share snapshot", async () => {
      const ownerUid = "owner-uid";
      const coachUid = "coach-uid";
      const teamId = "team-share";
      await seedTeam(teamId, ownerUid);
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "teams", teamId), {
          members: { [ownerUid]: "admin", [coachUid]: "coach" },
          memberUids: [ownerUid, coachUid],
        });
        await setDoc(doc(context.firestore(), "tacticsBoardShares", "tok1"), {
          shareToken: "tok1",
          teamId,
          boardId: "b1",
          permission: "view",
          createdBy: ownerUid,
          enabled: true,
          payload: { schema: "tactics_board_share_v2", title: "X" },
        });
      });

      const coachDb = testEnv!.authenticatedContext(coachUid).firestore();
      await assertSucceeds(
        updateDoc(doc(coachDb, "tacticsBoardShares", "tok1"), {
          shareToken: "tok1",
          teamId,
          boardId: "b1",
          createdBy: ownerUid,
          enabled: true,
          payload: {
            schema: "tactics_board_share_v2",
            title: "Updated",
            steps: [],
          },
        }),
      );
    });
  });
});
