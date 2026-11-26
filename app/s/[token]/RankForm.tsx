"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRanks } from "./actions";

export type RankGroup = {
  id: string;
  name: string;
  seatsLeft: number;
  available: boolean;
  drives: { date: string; time: string }[];
};

export default function RankForm({ token, groups, minRanks }: { token: string; groups: RankGroup[]; minRanks: number }) {
  const router = useRouter();
  const [ranked, setRanked] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: "bad" | "good"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const open = groups.filter((g) => g.available);
  const closed = groups.filter((g) => !g.available);
  // If nothing is open, let them rank full groups so they join the waitlist.
  const choosable = open.length ? open : groups;
  const required = Math.min(minRanks, Math.max(choosable.length, 1));
  const byId = new Map(groups.map((g) => [g.id, g]));

  const add = (id: string) => setRanked((r) => (r.includes(id) ? r : [...r, id]));
  const remove = (id: string) => setRanked((r) => r.filter((x) => x !== id));
  const move = (i: number, d: -1 | 1) =>
    setRanked((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const submit = () => {
    setMessage(null);
    if (ranked.length < required) {
      setMessage({ kind: "bad", text: `Add at least ${required} group${required === 1 ? "" : "s"} to your list.` });
      return;
    }
    startTransition(async () => {
      const res = await submitRanks(token, ranked);
      if (res.status === "error") {
        setMessage({ kind: "bad", text: res.message ?? "Something went wrong." });
        router.refresh();
      } else if (res.status === "waitlist") {
        setMessage({ kind: "bad", text: "Those groups just filled up. Please pick again from the open groups." });
        setRanked([]);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  };

  const card = (g: RankGroup, canAdd: boolean) => {
    const picked = ranked.includes(g.id);
    return (
      <article key={g.id} className={`group${g.available ? "" : " full"}${picked ? " picked" : ""}`}>
        <header>
          <h3>{g.name}</h3>
          <span className="seats">{g.available ? `${g.seatsLeft} spot${g.seatsLeft === 1 ? "" : "s"} left` : g.seatsLeft > 0 ? "Not available to you" : "Full"}</span>
        </header>
        <ul className="drv">
          {g.drives.map((d, i) => (
            <li key={i}><b>{d.date}</b><span className="nowrap">{d.time}</span></li>
          ))}
        </ul>
        {canAdd && (
          picked ? (
            <button type="button" onClick={() => remove(g.id)}>Remove from my list (#{ranked.indexOf(g.id) + 1})</button>
          ) : (
            <button type="button" className="go" onClick={() => add(g.id)}>Add as choice #{ranked.length + 1}</button>
          )
        )}
      </article>
    );
  };

  return (
    <>
      <div className="box">
        <h2 style={{ marginTop: 0 }}>My list</h2>
        {ranked.length === 0 ? (
          <p className="small">Nothing yet. Add groups below, starting with your favourite.</p>
        ) : (
          <ol className="ranklist">
            {ranked.map((id, i) => (
              <li key={id}>
                <span className="name">{byId.get(id)?.name}</span>
                <button type="button" className="x" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="x" onClick={() => move(i, 1)} disabled={i === ranked.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="x danger" onClick={() => remove(id)}>Remove</button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {open.length === 0 && (
        <p className="notice bad">Every group is full right now. Rank the ones you could make and you&apos;ll go on the waitlist. If a spot opens, you&apos;ll be placed automatically.</p>
      )}

      <div className="groups">{choosable.map((g) => card(g, true))}</div>
      {open.length > 0 && closed.length > 0 && (
        <>
          <h2>Full groups</h2>
          <div className="groups">{closed.map((g) => card(g, false))}</div>
        </>
      )}

      <div className="sticky">
        <button type="button" className="go" onClick={submit} disabled={pending}>
          {pending ? "Placing you…" : `Submit my ${ranked.length || ""} choice${ranked.length === 1 ? "" : "s"}`}
        </button>
        <span className="small">{ranked.length} of at least {required} added</span>
        {message && <span className={`notice ${message.kind}`} role="status">{message.text}</span>}
      </div>
    </>
  );
}
