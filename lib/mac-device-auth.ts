import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore, getAdminAuth } from "@/lib/firebase-admin";

const COL = "macDeviceSessions";
const TTL_MS = 10 * 60 * 1000;

function randomCode(len: number, alphabet: string): string {
  let out = "";
  const bytes = randomBytes(len);
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

export type MacDeviceSession = {
  deviceCode: string;
  userCode: string;
  status: "pending" | "completed" | "expired";
  uid?: string;
  email?: string;
  displayName?: string;
  customToken?: string;
  expiresAtMs: number;
};

export async function startMacDeviceSession(): Promise<{
  deviceCode: string;
  userCode: string;
  verificationPath: string;
  expiresInSec: number;
}> {
  const deviceCode = randomCode(32, "abcdefghijklmnopqrstuvwxyz0123456789");
  const userCode = randomCode(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  const expiresAtMs = Date.now() + TTL_MS;
  await adminFirestore.collection(COL).doc(deviceCode).set({
    deviceCode,
    userCode,
    status: "pending",
    expiresAtMs,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {
    deviceCode,
    userCode,
    verificationPath: `/mac/link?code=${encodeURIComponent(userCode)}`,
    expiresInSec: Math.floor(TTL_MS / 1000),
  };
}

export async function completeMacDeviceSession(input: {
  userCode: string;
  uid: string;
  email?: string;
  displayName?: string;
}): Promise<void> {
  const code = input.userCode.trim().toUpperCase();
  if (!code) throw new Error("USER_CODE_REQUIRED");

  const snap = await adminFirestore
    .collection(COL)
    .where("userCode", "==", code)
    .limit(5)
    .get();
  const doc = snap.docs.find((d) => {
    const data = d.data();
    return data.status === "pending" && typeof data.expiresAtMs === "number";
  });
  if (!doc) throw new Error("DEVICE_CODE_INVALID");
  const data = doc.data();
  if (data.expiresAtMs < Date.now()) {
    await doc.ref.set({ status: "expired" }, { merge: true });
    throw new Error("DEVICE_CODE_EXPIRED");
  }

  const auth = await getAdminAuth();
  const customToken = await auth.createCustomToken(input.uid, {
    macDevice: true,
  });

  await doc.ref.set(
    {
      status: "completed",
      uid: input.uid,
      ...(input.email ? { email: input.email } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
      customToken,
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function pollMacDeviceSession(
  deviceCode: string,
): Promise<
  | { status: "pending" }
  | { status: "expired" }
  | {
      status: "completed";
      customToken: string;
      uid: string;
      email?: string;
      displayName?: string;
    }
> {
  const code = deviceCode.trim();
  if (!code) throw new Error("DEVICE_CODE_REQUIRED");
  const snap = await adminFirestore.collection(COL).doc(code).get();
  if (!snap.exists) throw new Error("DEVICE_CODE_INVALID");
  const data = snap.data() ?? {};
  const expiresAtMs =
    typeof data.expiresAtMs === "number" ? data.expiresAtMs : 0;
  if (data.status === "expired" || expiresAtMs < Date.now()) {
    if (data.status !== "expired") {
      await snap.ref.set({ status: "expired" }, { merge: true });
    }
    return { status: "expired" };
  }
  if (data.status === "completed") {
    const customToken =
      typeof data.customToken === "string" ? data.customToken : "";
    const uid = typeof data.uid === "string" ? data.uid : "";
    if (!customToken || !uid) throw new Error("DEVICE_SESSION_INCOMPLETE");
    // One-time consume token from doc after successful poll.
    await snap.ref.set(
      {
        customToken: FieldValue.delete(),
        consumedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return {
      status: "completed",
      customToken,
      uid,
      ...(typeof data.email === "string" ? { email: data.email } : {}),
      ...(typeof data.displayName === "string"
        ? { displayName: data.displayName }
        : {}),
    };
  }
  return { status: "pending" };
}
