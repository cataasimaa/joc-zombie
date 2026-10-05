// Anunțurile din Warcraft / DotA: „Double Kill”, „Rampage”, „Monster Kill”...
// Două feluri:
//  - kill-uri multiple: mai mulți zombi omorâți repede unul după altul (fereastră de 1,6 s);
//  - serii: zombi omorâți fără să cazi (se resetează când mori).
// Plus anunțuri speciale când dobori un boss sau o brută.

import type { ZombieType } from "../core";

export interface Announcement {
  text: string;
  /** 1 = mic, 3 = uriaș (pentru mărimea textului și volumul vocii). */
  tier: 1 | 2 | 3;
}

const MULTI: Record<number, Announcement> = {
  2: { text: "Double Kill", tier: 1 },
  3: { text: "Triple Kill", tier: 2 },
  4: { text: "Ultra Kill", tier: 2 },
  5: { text: "Rampage!", tier: 3 },
};

const SPREE: [number, Announcement][] = [
  [10, { text: "Killing Spree", tier: 1 }],
  [20, { text: "Dominating", tier: 2 }],
  [30, { text: "Mega Kill", tier: 2 }],
  [45, { text: "Unstoppable", tier: 2 }],
  [60, { text: "Wicked Sick", tier: 3 }],
  [80, { text: "Monster Kill", tier: 3 }],
  [100, { text: "Godlike", tier: 3 }],
  [130, { text: "Holy Shit!", tier: 3 }],
];

const WINDOW = 1.6;

export class KillAnnouncer {
  private recent: number[] = [];
  private spree = 0;

  /** Un kill al jucătorului local la momentul `time` (secunde de joc). Returnează anunțul, dacă e cazul. */
  kill(time: number, type: ZombieType): Announcement | null {
    this.spree++;
    this.recent = this.recent.filter((t) => time - t <= WINDOW);
    this.recent.push(time);
    if (type === "boss") return { text: "Boss Slain!", tier: 3 };
    const spree = SPREE.find(([n]) => n === this.spree);
    const multi = MULTI[this.recent.length];
    // Seria are prioritate (e mai rară); altfel kill-ul multiplu, dar doar când crește.
    if (spree) return spree[1];
    if (this.recent.length >= 2 && multi) return multi;
    return null;
  }

  died(): void {
    this.spree = 0;
    this.recent = [];
  }

  reset(): void {
    this.died();
  }
}
