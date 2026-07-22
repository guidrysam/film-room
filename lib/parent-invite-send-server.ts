import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendEmailViaResend } from "@/lib/email/resend";
import { adminFirestore } from "@/lib/firebase-admin";
import { parentInviteMessage } from "@/lib/parent-onboarding";

function randomInviteCode(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function appOrigin(request: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin = request.headers.get("origin")?.trim();
  if (origin) return origin.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function inviteStillValid(data: Record<string, unknown>): boolean {
  if (data.active !== true) return false;
  const expiresAt = data.expiresAt;
  if (
    expiresAt &&
    typeof expiresAt === "object" &&
    "toMillis" in expiresAt &&
    typeof (expiresAt as { toMillis: () => number }).toMillis === "function"
  ) {
    return (expiresAt as { toMillis: () => number }).toMillis() > Date.now();
  }
  return true;
}

export async function ensureParentInviteCodeAdmin(input: {
  teamId: string;
  teamName: string;
  targetId: string;
  parentName: string;
  existingInviteCode?: string;
  createdBy: string;
}): Promise<string> {
  if (input.existingInviteCode) {
    const existing = await adminFirestore
      .collection("teamInvites")
      .doc(input.existingInviteCode)
      .get();
    if (existing.exists && inviteStillValid(existing.data() ?? {})) {
      return input.existingInviteCode;
    }
  }

  const code = randomInviteCode();
  const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 24 * 60 * 60 * 1000);
  await adminFirestore.collection("teamInvites").doc(code).set({
    teamId: input.teamId,
    teamName: input.teamName,
    role: "parent",
    label: `Parent: ${input.parentName}`,
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    active: true,
  });
  await adminFirestore
    .collection("teams")
    .doc(input.teamId)
    .collection("parentInviteTargets")
    .doc(input.targetId)
    .update({
      inviteCode: code,
      status: "invited",
      updatedAt: FieldValue.serverTimestamp(),
    });
  return code;
}

export type ParentInviteSendResult = {
  targetId: string;
  email: string;
  ok: boolean;
  error?: string;
  joinUrl?: string;
};

export async function sendParentInviteEmailAdmin(input: {
  request: Request;
  teamId: string;
  targetId: string;
  createdBy: string;
}): Promise<ParentInviteSendResult> {
  const teamSnap = await adminFirestore.collection("teams").doc(input.teamId).get();
  if (!teamSnap.exists) {
    return {
      targetId: input.targetId,
      email: "",
      ok: false,
      error: "Team not found.",
    };
  }
  const team = teamSnap.data() ?? {};
  const teamName =
    typeof team.name === "string" && team.name.trim()
      ? team.name.trim()
      : "your team";

  const targetSnap = await adminFirestore
    .collection("teams")
    .doc(input.teamId)
    .collection("parentInviteTargets")
    .doc(input.targetId)
    .get();
  if (!targetSnap.exists) {
    return {
      targetId: input.targetId,
      email: "",
      ok: false,
      error: "Parent contact not found.",
    };
  }
  const target = targetSnap.data() ?? {};
  const email =
    typeof target.email === "string" ? target.email.trim().toLowerCase() : "";
  const parentName =
    typeof target.parentName === "string" && target.parentName.trim()
      ? target.parentName.trim()
      : "there";
  const status = typeof target.status === "string" ? target.status : "not_invited";

  if (!email) {
    return {
      targetId: input.targetId,
      email: "",
      ok: false,
      error: "Parent contact has no email.",
    };
  }
  if (status === "joined" || status === "ignored") {
    return {
      targetId: input.targetId,
      email,
      ok: false,
      error:
        status === "joined"
          ? "Parent already joined."
          : "Parent contact is ignored.",
    };
  }

  const code = await ensureParentInviteCodeAdmin({
    teamId: input.teamId,
    teamName,
    targetId: input.targetId,
    parentName,
    existingInviteCode:
      typeof target.inviteCode === "string" ? target.inviteCode : undefined,
    createdBy: input.createdBy,
  });

  const joinUrl = `${appOrigin(input.request)}/join/team/${code}`;
  const subject = `Join ${teamName} on Film Room`;
  const text = parentInviteMessage(parentName, teamName, joinUrl);
  const sent = await sendEmailViaResend({
    to: email,
    subject,
    text,
    html: text.replace(/\n/g, "<br />"),
  });

  if (!sent.ok) {
    return {
      targetId: input.targetId,
      email,
      ok: false,
      error: sent.error,
      joinUrl,
    };
  }

  return {
    targetId: input.targetId,
    email,
    ok: true,
    joinUrl,
  };
}
