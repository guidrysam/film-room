/**
 * Verify a Firebase ID token without requiring the Admin SDK service account.
 * Uses the Identity Toolkit REST API with the public web API key.
 */
export async function verifyFirebaseIdTokenRest(idToken: string): Promise<{
  uid: string;
  email?: string;
}> {
  if (!idToken.trim()) {
    throw new Error("AUTH_REQUIRED");
  }
  const apiKey =
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
    process.env.FIREBASE_WEB_API_KEY?.trim() ||
    "AIzaSyDoqx15Pb6GSHjPBACABkJaqAj6dAOlH_w";
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );
  const body = (await response.json()) as {
    error?: { message?: string };
    users?: Array<{ localId?: string; email?: string }>;
  };
  if (!response.ok) {
    throw new Error("AUTH_REQUIRED");
  }
  const uid = body.users?.[0]?.localId;
  if (!uid) throw new Error("AUTH_REQUIRED");
  return {
    uid,
    ...(body.users?.[0]?.email ? { email: body.users[0].email } : {}),
  };
}
