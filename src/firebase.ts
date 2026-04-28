import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  databaseURL: "https://commissary-dashboard-ccd7c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:06014985cd9e8e1c9b5827",
  measurementId: "G-2V6E5ZD8E6",
};

const app  = initializeApp(firebaseConfig);
// No offline persistence — writes go directly to Firestore server
// This ensures reliable cross-device sync
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ── COLLECTION NAMES ──────────────────────────────────────────────────────────
export const COLLECTIONS = {
  deliveries:  "deliveries",
  productions: "productions",
  invEntries:  "invEntries",
  pullOuts:    "pullOuts",
  settings:    "settings",
} as const;

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Save a single document — uses item.id as the document ID
export async function saveDoc(collectionName: string, item: any) {
  const ref = doc(db, collectionName, String(item.id));
  await setDoc(ref, item);
}

// Save multiple documents in a single batch (max 500 per batch)
export async function saveBatch(collectionName: string, items: any[]) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 400) {
    chunks.push(items.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, collectionName, String(item.id));
      batch.set(ref, item);
    }
    await batch.commit();
  }
}

// Delete a single document
export async function deleteDocument(collectionName: string, id: string | number) {
  const ref = doc(db, collectionName, String(id));
  await deleteDoc(ref);
}

// Subscribe to a collection — calls callback with full array on every change
export function subscribeToCollection(
  collectionName: string,
  callback: (items: any[]) => void
) {
  const ref = collection(db, collectionName);
  return onSnapshot(ref, snapshot => {
    const items = snapshot.docs.map(d => d.data());
    callback(items);
  });
}

// ── USER ROLES ────────────────────────────────────────────────────────────────
export type UserRole = "superadmin" | "admin" | "viewer";

export interface AppUser {
  email:          string;
  name:           string;
  role:           UserRole;
  inventoryAdmin?: boolean;
}

export const USER_ROLES: Record<string, AppUser> = {
  "tonixgil04@gmail.com":      { email:"tonixgil04@gmail.com",      name:"Toni",  role:"viewer"     },
  "kliendacasin1996@gmail.com":{ email:"kliendacasin1996@gmail.com", name:"Klien", role:"viewer"     },
  "chris@theblackbean.ph":     { email:"chris@theblackbean.ph",      name:"Chris", role:"superadmin", inventoryAdmin:true },
  "hello@theblackbean.ph":     { email:"hello@theblackbean.ph",      name:"Team",  role:"admin"      },
};

export function getUserInfo(email: string | null | undefined): AppUser | null {
  if (!email) return null;
  return USER_ROLES[email.toLowerCase()] ?? null;
}

// Clear all documents in a collection
export async function clearCollection(collectionName: string) {
  const snap = await getDocs(collection(db, collectionName));
  const batch = writeBatch(db);
  snap.docs.forEach(d=>batch.delete(d.ref));
  await batch.commit();
}

// Auth helpers
export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  return signOut(auth);
}

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  writeBatch, query, orderBy, limit, startAfter, getDocs
};
