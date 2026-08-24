/**
 * Club-scoped sponsor logo library (reusable across highlight reels).
 *
 * Layout: clubs/{clubId}/sponsors/{sponsorId}
 * Stored as resized data URLs (same approach as crest logos).
 */

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import {
  canEditClubBranding,
  getClub,
} from "@/lib/clubs";
import {
  newSponsorId,
  type HighlightSponsorLogo,
} from "@/lib/highlight-sponsors";
import { resizeLogoToDataUrl } from "@/lib/team-logo";

export const MAX_CLUB_SPONSORS = 24;

export type ClubSponsorLogo = {
  id: string;
  logoUrl: string;
  name?: string;
  createdBy?: string;
  createdAt: Timestamp | null;
};

function sponsorsCol(clubId: string) {
  return collection(firestore, "clubs", clubId, "sponsors");
}

function parseSponsor(
  id: string,
  raw: Record<string, unknown>,
): ClubSponsorLogo | null {
  const logoUrl = typeof raw.logoUrl === "string" ? raw.logoUrl.trim() : "";
  if (!logoUrl.startsWith("data:image/")) return null;
  return {
    id,
    logoUrl,
    ...(typeof raw.name === "string" && raw.name.trim()
      ? { name: raw.name.trim().slice(0, 80) }
      : {}),
    ...(typeof raw.createdBy === "string" ? { createdBy: raw.createdBy } : {}),
    createdAt:
      raw.createdAt && typeof raw.createdAt === "object"
        ? (raw.createdAt as Timestamp)
        : null,
  };
}

export function clubSponsorToReelSponsor(
  sponsor: Pick<ClubSponsorLogo, "logoUrl" | "name">,
): HighlightSponsorLogo {
  return {
    id: newSponsorId(),
    logoUrl: sponsor.logoUrl,
    ...(sponsor.name ? { name: sponsor.name } : {}),
  };
}

/** List saved sponsor logos for a club (members only via rules). */
export async function listClubSponsors(
  clubId: string,
): Promise<ClubSponsorLogo[]> {
  let snap;
  try {
    snap = await getDocs(
      query(sponsorsCol(clubId), orderBy("createdAt", "desc")),
    );
  } catch {
    snap = await getDocs(sponsorsCol(clubId));
  }
  const out: ClubSponsorLogo[] = [];
  for (const d of snap.docs) {
    const parsed = parseSponsor(d.id, d.data() as Record<string, unknown>);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    return bt - at;
  });
  return out;
}

export type AddClubSponsorInput = {
  file?: File;
  /** Pre-resized data URL (e.g. already prepared for a reel). */
  logoUrl?: string;
  name?: string;
};

/** Upload / save a sponsor into the club library. */
export async function addClubSponsor(
  clubId: string,
  input: AddClubSponsorInput,
): Promise<ClubSponsorLogo> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const club = await getClub(clubId);
  if (!club) throw new Error("Club not found.");
  if (!canEditClubBranding(club, user.uid)) {
    throw new Error("Only club staff can manage sponsor logos.");
  }

  const existing = await listClubSponsors(clubId);
  if (existing.length >= MAX_CLUB_SPONSORS) {
    throw new Error(`Up to ${MAX_CLUB_SPONSORS} sponsor logos per club.`);
  }

  let logoUrl = input.logoUrl?.trim() ?? "";
  if (input.file) {
    logoUrl = await resizeLogoToDataUrl(input.file);
  }
  if (!logoUrl.startsWith("data:image/")) {
    throw new Error("Choose a PNG, JPG, WebP, or GIF logo.");
  }

  const id = newSponsorId();
  const name = input.name?.trim().slice(0, 80);
  const data: Record<string, unknown> = {
    logoUrl,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (name) data.name = name;

  try {
    await setDoc(doc(sponsorsCol(clubId), id), data);
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not save sponsor logo.");
  }

  return {
    id,
    logoUrl,
    ...(name ? { name } : {}),
    createdBy: user.uid,
    createdAt: null,
  };
}

export async function updateClubSponsorName(
  clubId: string,
  sponsorId: string,
  name: string | null,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const club = await getClub(clubId);
  if (!club) throw new Error("Club not found.");
  if (!canEditClubBranding(club, user.uid)) {
    throw new Error("Only club staff can manage sponsor logos.");
  }

  const trimmed = name?.trim().slice(0, 80) ?? "";
  try {
    await updateDoc(doc(sponsorsCol(clubId), sponsorId), {
      name: trimmed ? trimmed : deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not update sponsor.");
  }
}

export async function removeClubSponsor(
  clubId: string,
  sponsorId: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const club = await getClub(clubId);
  if (!club) throw new Error("Club not found.");
  if (!canEditClubBranding(club, user.uid)) {
    throw new Error("Only club staff can manage sponsor logos.");
  }

  try {
    await deleteDoc(doc(sponsorsCol(clubId), sponsorId));
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not remove sponsor logo.");
  }
}
