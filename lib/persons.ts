import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";

/**
 * Club-scoped person registry (stored per coach/account for now).
 *
 * A Person is the durable identity behind roster entries across event-specific
 * teams. Jersey numbers live on roster rows; persons are matched by name.
 */

export type Person = {
  id: string;
  name: string;
  /** Normalized name for matching across imports. */
  normalizedName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

function personsCol(ownerUid: string) {
  return collection(firestore, "users", ownerUid, "persons");
}

export function personNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function personNameTokens(name: string): string[] {
  return personNameKey(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Fuzzy similarity (0–1) between two person names. */
export function personNameSimilarity(a: string, b: string): number {
  const ka = personNameKey(a);
  const kb = personNameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;

  const ta = personNameTokens(a);
  const tb = personNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...sa, ...sb]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const contains = ka.includes(kb) || kb.includes(ka) ? 0.25 : 0;
  return Math.min(1, jaccard + contains);
}

export type PersonNameMatch = { person: Person; score: number };

const PERSON_MATCH_THRESHOLD = 0.85;
const PERSON_DUPLICATE_MIN = 0.65;

export type PersonDuplicatePair = {
  a: Person;
  b: Person;
  score: number;
};

/** Surface name pairs that might be the same kid (below auto-link threshold). */
export function findPossiblePersonDuplicates(
  persons: Person[],
): PersonDuplicatePair[] {
  const out: PersonDuplicatePair[] = [];
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i]!;
      const b = persons[j]!;
      const score = personNameSimilarity(a.name, b.name);
      if (score >= PERSON_DUPLICATE_MIN && score < PERSON_MATCH_THRESHOLD) {
        out.push({ a, b, score });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

export function findBestPersonMatch(
  persons: Person[],
  name: string,
): PersonNameMatch | undefined {
  let best: PersonNameMatch | undefined;
  for (const person of persons) {
    const score = personNameSimilarity(person.name, name);
    if (!best || score > best.score) best = { person, score };
  }
  if (!best || best.score < PERSON_MATCH_THRESHOLD) return undefined;
  return best;
}

function parsePerson(id: string, raw: Record<string, unknown>): Person {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  return {
    id,
    name: name || "Player",
    normalizedName:
      typeof raw.normalizedName === "string"
        ? raw.normalizedName
        : personNameKey(name),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export async function getPerson(
  ownerUid: string,
  personId: string,
): Promise<Person | null> {
  const snap = await getDoc(doc(personsCol(ownerUid), personId));
  if (!snap.exists()) return null;
  return parsePerson(snap.id, snap.data() as Record<string, unknown>);
}

export async function listPersons(ownerUid: string): Promise<Person[]> {
  const snap = await getDocs(personsCol(ownerUid));
  const out: Person[] = [];
  snap.forEach((d) =>
    out.push(parsePerson(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function createPerson(
  ownerUid: string,
  name: string,
): Promise<Person> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Person name is required.");

  const ref = doc(personsCol(ownerUid));
  const now = serverTimestamp();
  const payload = {
    name: trimmed,
    normalizedName: personNameKey(trimmed),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(ref, payload);
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not create person record.");
  }
  return {
    id: ref.id,
    name: trimmed,
    normalizedName: personNameKey(trimmed),
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Resolve a person id for a roster name — match existing or create new.
 * Mutates the in-memory cache when a new person is created.
 */
export async function resolvePersonId(
  ownerUid: string,
  name: string,
  cache: Person[],
): Promise<{ personId: string; created: boolean; cache: Person[] }> {
  const match = findBestPersonMatch(cache, name);
  if (match) {
    return { personId: match.person.id, created: false, cache };
  }
  const person = await createPerson(ownerUid, name);
  const next = [...cache, person].sort((a, b) => a.name.localeCompare(b.name));
  return { personId: person.id, created: true, cache: next };
}

export async function deletePerson(
  ownerUid: string,
  personId: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== ownerUid) {
    throw new Error("Sign in required.");
  }
  try {
    await deleteDoc(doc(personsCol(ownerUid), personId));
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not delete person record.");
  }
}
