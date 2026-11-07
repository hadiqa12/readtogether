const PROFILE_KEY = "common-margins.profile";
const PHOTO_KEY = "common-margins.photo";

export type SavedReader = {
  name: string;
  book: string;
  photo?: string;
};

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPhoto(store: Storage) {
  try {
    const photo = store.getItem(PHOTO_KEY);
    if (photo?.startsWith("data:image/")) return photo;
  } catch {
    return undefined;
  }
  return undefined;
}

export function loadSavedReader(): SavedReader | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(PROFILE_KEY);
    const photo = readPhoto(store);
    if (!raw) return photo ? { name: "", book: "", photo } : null;

    const parsed = JSON.parse(raw) as Partial<SavedReader>;
    const name = typeof parsed.name === "string" ? parsed.name.slice(0, 40) : "";
    const book = typeof parsed.book === "string" ? parsed.book.slice(0, 80) : "";
    if (!name && !book && !photo) return null;
    return { name, book, photo };
  } catch {
    return null;
  }
}

export function saveSavedReader(reader: SavedReader) {
  const store = storage();
  if (!store) return { photoSaved: !reader.photo };

  let profileSaved = false;
  try {
    store.setItem(PROFILE_KEY, JSON.stringify({ name: reader.name, book: reader.book }));
    profileSaved = true;
  } catch {
    profileSaved = false;
  }

  if (!reader.photo) {
    try {
      store.removeItem(PHOTO_KEY);
    } catch {
      // The name and book are the part that has to stick.
    }
    return { profileSaved, photoSaved: true };
  }

  try {
    store.setItem(PHOTO_KEY, reader.photo);
    return { profileSaved, photoSaved: true };
  } catch {
    return { profileSaved, photoSaved: false };
  }
}
