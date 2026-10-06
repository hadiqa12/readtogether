"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Camera, DoorOpen, LoaderCircle, MapPin, Sparkles, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const GENRES = {
  fantasy: { label: "Fantasy", eyebrow: "The cloud gardens", prompt: "A sky-bound world of luminous gardens" },
  mystery: { label: "Mystery", eyebrow: "The midnight arcade", prompt: "A rain-slick city where every window is a clue" },
  romance: { label: "Romance", eyebrow: "The rose observatory", prompt: "A warm horizon where stories orbit each other" },
  scifi: { label: "Science fiction", eyebrow: "The orbital stacks", prompt: "A library drifting at the edge of a violet sun" },
  classics: { label: "Classics", eyebrow: "The endless colonnade", prompt: "A sunlit archive that remembers every reader" },
  poetry: { label: "Poetry", eyebrow: "The whispering field", prompt: "A quiet landscape made of breath and wild grass" },
} as const;

type Genre = keyof typeof GENRES;
type Reader = { id: string; name: string; book: string; genre: Genre; photo?: string; x: number; y: number; lastSeen: number; isDemo?: boolean };

const DEMO_READERS: Reader[] = [
  { id: "mira", name: "Mira Chen", book: "Piranesi", genre: "fantasy", x: 23, y: 31, lastSeen: 0, isDemo: true },
  { id: "theo", name: "Theo A.", book: "The Spear Cuts Through Water", genre: "fantasy", x: 68, y: 58, lastSeen: 0, isDemo: true },
  { id: "ivy", name: "Ivy Brooks", book: "The Night Circus", genre: "fantasy", x: 82, y: 27, lastSeen: 0, isDemo: true },
  { id: "nadia", name: "Nadia", book: "The Thursday Murder Club", genre: "mystery", x: 27, y: 62, lastSeen: 0, isDemo: true },
  { id: "cal", name: "Cal Morgan", book: "The Big Sleep", genre: "mystery", x: 73, y: 34, lastSeen: 0, isDemo: true },
  { id: "leo", name: "Leo Park", book: "Open Water", genre: "romance", x: 30, y: 38, lastSeen: 0, isDemo: true },
  { id: "sasha", name: "Sasha", book: "Cleopatra and Frankenstein", genre: "romance", x: 72, y: 65, lastSeen: 0, isDemo: true },
  { id: "ren", name: "Ren Okafor", book: "Parable of the Sower", genre: "scifi", x: 21, y: 58, lastSeen: 0, isDemo: true },
  { id: "jo", name: "Jo Bell", book: "Sea of Tranquility", genre: "scifi", x: 70, y: 29, lastSeen: 0, isDemo: true },
  { id: "ama", name: "Ama", book: "Devotions", genre: "poetry", x: 28, y: 32, lastSeen: 0, isDemo: true },
  { id: "silas", name: "Silas Reed", book: "Citizen", genre: "poetry", x: 76, y: 60, lastSeen: 0, isDemo: true },
];

const genreKeys = Object.keys(GENRES) as Genre[];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function GenreArtwork({ genre, compact = false }: { genre: Genre; compact?: boolean }) {
  return (
    <div className={`genre-art genre-${genre} ${compact ? "genre-art-compact" : ""}`} aria-hidden="true">
      <div className="world-orb world-orb-one" /><div className="world-orb world-orb-two" />
      <div className="world-lines" /><div className="world-door"><span /></div>
      <div className="world-stars"><i /><i /><i /><i /><i /></div>
    </div>
  );
}

function ReaderAvatar({ reader, selected, onSelect }: { reader: Reader; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`reader-marker ${selected ? "reader-marker-selected" : ""}`} style={{ left: `${reader.x}%`, top: `${reader.y}%` }} onClick={onSelect} aria-label={`View ${reader.name}, reading ${reader.book}`}>
      <span className="reader-ripple" />
      <Avatar className="reader-avatar">{reader.photo ? <AvatarImage src={reader.photo} alt="" /> : null}<AvatarFallback className="reader-fallback">{initials(reader.name)}</AvatarFallback></Avatar>
      <span className="reader-label"><strong>{reader.name}</strong><span>{reader.book}</span></span>
    </button>
  );
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [book, setBook] = useState("");
  const [genre, setGenre] = useState<Genre>("fantasy");
  const [genreOpen, setGenreOpen] = useState(false);
  const [photo, setPhoto] = useState<string>();
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"onboarding" | "entering" | "world">("onboarding");
  const [me, setMe] = useState<Reader | null>(null);
  const [liveReaders, setLiveReaders] = useState<Reader[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceError, setPresenceError] = useState(false);

  const readers = useMemo(() => {
    if (!me) return [];
    return [me, ...liveReaders.filter((reader) => reader.genre === me.genre && reader.id !== me.id), ...DEMO_READERS.filter((reader) => reader.genre === me.genre)];
  }, [liveReaders, me]);
  const selectedReader = readers.find((reader) => reader.id === selectedId) ?? null;

  useEffect(() => {
    if (stage !== "world" || !me) return;
    let active = true;

    const updateReaders = (next: Reader[]) => {
      if (!active) return;
      setLiveReaders(next);
      setPresenceLoading(false);
      setPresenceError(false);
    };

    const join = async () => {
      const response = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", reader: me }),
      });
      if (!response.ok) throw new Error("Presence join failed");
      const data = (await response.json()) as { readers: Reader[] };
      updateReaders(data.readers);
    };

    const heartbeat = async () => {
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "heartbeat",
            id: me.id,
            genre: me.genre,
          }),
        });
        if (!response.ok) throw new Error("Presence heartbeat failed");
        const data = (await response.json()) as {
          readers: Reader[];
          missing?: boolean;
        };
        if (data.missing) {
          await join();
        } else {
          updateReaders(data.readers);
        }
      } catch {
        if (!active) return;
        setPresenceLoading(false);
        setPresenceError(true);
      }
    };

    join().catch(() => {
      if (!active) return;
      setPresenceLoading(false);
      setPresenceError(true);
    });
    const interval = window.setInterval(heartbeat, 2_500);

    return () => {
      active = false;
      window.clearInterval(interval);
      const payload = JSON.stringify({ action: "leave", id: me.id });
      if (!navigator.sendBeacon("/api/presence", payload)) {
        void fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    };
  }, [me, stage]);

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 900_000) { setError("Choose an image smaller than 900 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => { setPhoto(String(reader.result)); setError(""); };
    reader.onerror = () => setError("We couldn’t read that image. Try another file."); reader.readAsDataURL(file);
  }

  function enterWorld(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !book.trim()) { setError("Tell us your name and what you’re reading first."); return; }
    setError(""); setStage("entering");
    const reader: Reader = { id: crypto.randomUUID(), name: name.trim(), book: book.trim(), genre, photo, x: Math.round(18 + Math.random() * 64), y: Math.round(27 + Math.random() * 42), lastSeen: Date.now() };
    window.setTimeout(() => { setMe(reader); setSelectedId(reader.id); setPresenceLoading(true); setStage("world"); }, 950);
  }

  function leaveWorld() { setStage("onboarding"); setMe(null); setLiveReaders([]); setSelectedId(null); }

  if (stage === "entering") return (
    <main className={`transition-screen genre-${genre}`}><GenreArtwork genre={genre} />
      <div className="transition-copy"><LoaderCircle className="size-5 animate-spin" /><p>Opening {GENRES[genre].eyebrow.toLowerCase()}…</p><span>Making a place for {name.trim()} and {book.trim()}</span></div>
    </main>
  );

  if (stage === "world" && me) {
    const genreInfo = GENRES[me.genre]; const companions = readers.length - 1;
    return (
      <main className={`reading-world genre-${me.genre}`}><GenreArtwork genre={me.genre} />
        <header className="world-header">
          <button type="button" className="brand-lockup brand-light" onClick={leaveWorld}><span className="brand-mark"><BookOpen /></span><span><strong>Common Margins</strong><small>Read somewhere else</small></span></button>
          <div className="world-header-actions"><div className="genre-chip"><span className="live-dot" />{genreInfo.label}</div><Button variant="ghost" className="leave-button" onClick={leaveWorld}><ArrowLeft /><span className="hidden sm:inline">Choose another door</span></Button></div>
        </header>
        <section className="world-intro" aria-labelledby="world-title"><p><Sparkles /> {genreInfo.eyebrow}</p><h1 id="world-title">{genreInfo.prompt}</h1><span>{presenceError ? "Connection paused—trying again…" : presenceLoading ? "Looking for nearby readers…" : `${companions} ${companions === 1 ? "reader shares" : "readers share"} this world with ${me.name}`}</span></section>
        <div className="world-map" aria-label="Readers in this world">
          {presenceLoading ? <div className="presence-loading"><span /><span /><span /></div> : readers.map((reader) => <ReaderAvatar key={reader.id} reader={reader} selected={reader.id === selectedId} onSelect={() => setSelectedId(reader.id)} />)}
          {!presenceLoading && readers.length === 1 ? <div className="empty-world"><DoorOpen /><strong>{me.name} found a quiet corner.</strong><span>Invite a fellow reader to this genre from any browser or device.</span></div> : null}
        </div>
        <div className="world-footer">
          <div className="presence-summary"><Users /><div><strong>{presenceError ? "Reconnecting to readers" : presenceLoading ? "Gathering the room" : `${readers.length} in this world`}</strong><span>Live across devices · isolated to the {genreInfo.label.toLowerCase()} door</span></div></div>
          <div className="my-book"><span>{me.name}’s current read</span><strong>{me.book}</strong></div>
        </div>
        {selectedReader ? <aside className="reader-card"><button type="button" onClick={() => setSelectedId(null)} aria-label="Close reader card"><X /></button><Avatar className="reader-card-avatar">{selectedReader.photo ? <AvatarImage src={selectedReader.photo} alt="" /> : null}<AvatarFallback>{initials(selectedReader.name)}</AvatarFallback></Avatar><div><span>Reading in this world</span><strong>{selectedReader.name}</strong><p><BookOpen /> {selectedReader.book}</p></div></aside> : null}
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-form-panel">
        <div className="brand-lockup"><span className="brand-mark"><BookOpen /></span><span><strong>Common Margins</strong><small>Read somewhere else</small></span></div>
        <div className="form-wrap">
          <div className="step-label"><span>01</span> Find your reading world</div>
          <h1>Bring a book.<br />Choose a <em>door.</em></h1>
          <p className="form-lede">A shared landscape for quiet readers. See who is wandering through the same genre—without interrupting the page.</p>
          <form onSubmit={enterWorld} className="onboarding-form">
            <div className="photo-name-row"><div><input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={handlePhoto} aria-label="Upload a profile photo" /><button type="button" className="photo-button" onClick={() => fileInput.current?.click()} aria-label={photo ? "Change profile photo" : "Add profile photo"}><Avatar className="photo-preview">{photo ? <AvatarImage src={photo} alt="" /> : null}<AvatarFallback><Camera /></AvatarFallback></Avatar><span>{photo ? "Change" : "Add photo"}<small>Optional</small></span></button></div><div className="field"><Label htmlFor="name">Your name</Label><Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="How should readers see you?" autoComplete="name" maxLength={40} /></div></div>
            <div className="field"><Label htmlFor="book">What are you reading?</Label><Input id="book" value={book} onChange={(event) => setBook(event.target.value)} placeholder="Book title" maxLength={80} /></div>
            <div className="field"><Label htmlFor="genre">Which door will you take?</Label><Select value={genre} open={genreOpen} onOpenChange={setGenreOpen} onValueChange={(value) => value && setGenre(value as Genre)}><SelectTrigger id="genre" className="genre-select" onClick={() => setGenreOpen(true)}><SelectValue /></SelectTrigger><SelectContent>{genreKeys.map((key) => <SelectItem key={key} value={key}><span className={`genre-swatch swatch-${key}`} />{GENRES[key].label}</SelectItem>)}</SelectContent></Select></div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}<Button type="submit" className="enter-button">Enter this reading world <ArrowRight /></Button>
          </form>
        </div>
        <p className="privacy-note"><span className="live-dot" /> Your presence disappears when you leave.</p>
      </section>
      <section className="door-panel" aria-label={`${GENRES[genre].label} world preview`}><GenreArtwork genre={genre} compact />
        <div className="door-panel-top"><span>Door <strong>{String(genreKeys.indexOf(genre) + 1).padStart(2, "0")}</strong> / 06</span><span><MapPin /> Shared world</span></div>
        <div className="door-caption"><span>{GENRES[genre].eyebrow}</span><h2>{GENRES[genre].label}</h2><p>{GENRES[genre].prompt}</p><div className="door-avatars">{DEMO_READERS.filter((reader) => reader.genre === genre).slice(0, 3).map((reader) => <Avatar key={reader.id}><AvatarFallback>{initials(reader.name)}</AvatarFallback></Avatar>)}<small>{DEMO_READERS.some((reader) => reader.genre === genre) ? "Readers are already wandering here" : "Be the first through this door"}</small></div></div>
        <div className="door-quote">“Reading is an exercise in empathy.” <span>— Malorie Blackman</span></div>
      </section>
    </main>
  );
}
