import {
  signInWithEmailAndPassword,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  playerUsernameToAuthEmail,
  validatePlayerPassword,
  validatePlayerUsername,
} from "@/lib/player-auth";

export async function signInWithPlayerUsernamePassword(
  usernameRaw: string,
  password: string,
): Promise<UserCredential> {
  const usernameCheck = validatePlayerUsername(usernameRaw);
  if (!usernameCheck.ok) {
    throw new Error(usernameCheck.error ?? "Invalid username.");
  }
  const passwordCheck = validatePlayerPassword(password);
  if (!passwordCheck.ok) {
    throw new Error(passwordCheck.error ?? "Invalid password.");
  }
  const email = playerUsernameToAuthEmail(usernameCheck.username);
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (
      code === "auth/invalid-credential" ||
      code === "auth/user-not-found" ||
      code === "auth/wrong-password" ||
      code === "auth/invalid-email"
    ) {
      throw new Error("Username or password is incorrect.");
    }
    if (code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Wait a minute and try again.");
    }
    throw new Error("Could not sign in. Check your username and password.");
  }
}
