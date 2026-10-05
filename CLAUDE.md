# Iarna Morților — survival tower defense co-op (3D, mobil)

Joc 3D pentru mobil (iOS întâi, apoi Android): 2–4 jucători co-op își apără adăpostul
în care se ascunde familia lor, într-un sat de munte înzăpezit.

Proprietarul proiectului e începător în game dev: explică pe scurt, în română,
ce face fiecare pas / schimbare importantă.

## Stack

- **Babylon.js** (`@babylonjs/core`) + **TypeScript** + **Vite**
- **Vitest** pentru testele logicii de joc
- **Capacitor** pentru build iOS / Android (la final)
- **Colyseus** (server Node.js) pentru multiplayer în faza 2

## Comenzi

```bash
npm install
npm run dev        # server de dezvoltare (accesibil și de pe telefon în aceeași rețea Wi-Fi)
npm test           # testele logicii (src/core)
npm run typecheck
npm run build      # typecheck + build de producție în dist/
```

Controale în browser: **WASD / săgeți** mișcare, **B** mod construcție, **Esc** ieșire din
construcție, **Enter** pornește valul imediat. În consola din dev: `game().state`.

## Arhitectură (REGULĂ IMPORTANTĂ)

Logica jocului este complet separată de randare și de input, ca să poată fi mutată
pe server (Colyseus) în faza 2 fără rescriere.

```
src/
  core/        LOGICA — TypeScript pur. NU importă Babylon, DOM, window, Date.now în step().
    Game.ts        GameSimulation: enqueue(command) → step(dt) → state + drainEvents()
    types.ts       GameState = doar date simple (serializabile JSON)
    commands.ts    Comenzile jucătorilor (singura cale de a modifica starea)
    config.ts      TOATE numerele de echilibrare
    map.ts         Harta (case, brazi) – generată determinist, folosită pentru coliziuni
    math.ts        Vec2 pe planul solului (x, z), RNG determinist (seed în stare)
    systems/       câte un fișier pe sistem: waves, heroes, zombies, towers, coins, physics
  render/      Babylon.js — doar CITEȘTE starea și desenează (Renderer.sync)
  input/       Tastatură + joystick virtual → produc comenzi
  ui/          HUD în HTML/CSS peste canvas — citește starea, emite acțiuni prin callback-uri
  main.ts      Leagă totul: input → comenzi → simulare (pas fix 30/s) → randare + HUD
```

Reguli:
- Orice schimbare de gameplay trece prin `core/` și printr-o `Command`. Randarea și UI-ul nu
  modifică niciodată `GameState`.
- `GameState` rămâne JSON simplu (fără clase, fără referințe circulare) → ușor de sincronizat.
- Simularea rulează cu **pas fix** (`CONFIG.tickRate`) și RNG cu seed → deterministă (există test).
- Efectele vizuale/sonore one-shot vin din `GameEvent` (ex. `shot`, `zombieDied`), nu din
  compararea stărilor.
- Validările (ex. `canPlaceTower`) stau în core; UI-ul le refolosește doar pentru feedback.
- Coordonate: jocul e pe planul (x, z); în Babylon `y` e înălțimea. +z = „sus” pe ecran.
- Numerele de echilibrare merg în `config.ts`, nu „hardcodate” în sisteme.

## Design

### Concept
- 2–4 jucători co-op își apără **adăpostul** (familia e înăuntru). Adăpost distrus = game over.
- Zombii vin în **valuri**; între valuri: **60 s de pauză** pentru construit și repoziționare.
- O singură hartă, mărime medie: **sat de munte iarna** — zăpadă, brazi, case de lemn,
  adăpostul în centru.
- Dificultatea valurilor crește cu numărul de jucători.

### Eroi (stil Warcraft 3: nivel, XP, abilități)
- 4 clase: **Healer, Sniper, Assault Rifle, Tank**.
- Fiecare erou: 3 abilități + 1 ultimate; crește în nivel cu XP.
- **Healer**: vindecă aliați, poate reînvia un coleg căzut.
- **Sniper**: rază mare, damage mare pe o singură țintă, lovituri critice.
- **Assault Rifle**: damage constant pe mai multe ținte, grenadă.
- **Tank**: mult HP, atrage zombii (taunt), scut, repară baricadele mai repede.

### Construcții
- Doar **turnuri** și **baricade**.
- Fiecare jucător are sloturi și resurse limitate, care cresc în timp
  (ex. +1 slot la fiecare 3 valuri).
- Turnurile au **tier-uri 1–4**, deblocate prin cufere.

### Monede și cufere
- Zombii lasă monede pe jos; fiecare jucător le colectează **individual**, mergând peste ele.
- Monedele se folosesc la roll-uri de cufere: **common, rare, epic, legendary**.
- Recompense: arme mai bune, skin-uri pentru eroi, tier-uri noi de turnuri.
- Șansele fiecărei rarități se afișează în joc.

### Control pe mobil
- Cameră de sus, înclinată (stil RTS), care urmărește eroul.
- Joystick virtual în stânga (mișcare), butoane de abilități în dreapta.
- Atac automat asupra celui mai apropiat zombie din rază.
- Mod construcție: tap pe un loc liber → alegi turn sau baricadă.
- Orientare **landscape**.

### Grafică
- Low-poly, performant pe telefon (instanțe pentru obiecte repetate, fără umbre scumpe,
  rezoluție limitată la 1.5x DPR).
- Prototip: forme geometrice simple (capsule, cuburi, cilindri).
- Mai târziu: asset-uri CC0 low-poly (Kenney, Quaternius).

## Roadmap

### Pas 1 — prototip single-player ✅
- [x] Proiect Babylon.js + TS + Vite, arhitectură core / render / input / ui
- [x] Teren alb cu adăpost în centru (are HP), case și brazi cu coliziuni
- [x] Erou Assault Rifle: joystick virtual + tastatură, atac automat pe cel mai apropiat zombie
- [x] Zombii apar la marginea hărții, merg spre adăpost (sau spre erou, dacă e aproape) și atacă
- [x] Un tip de turn, plasat în mod construcție (cost, sloturi, validare loc)
- [x] 3 valuri, pauză de 60 s cu cronometru (+ buton „Pornește acum”)
- [x] Monede care cad din zombi și se colectează mergând peste ele
- [x] Ecran de game over / victorie + „Joacă din nou”
- [x] XP și nivel simplu (damage + HP crescute)

### Pas 2 — gameplay complet single-player
- Baricade (blochează / încetinesc zombii, au HP, pot fi reparate)
- Abilitățile Assault Rifle (grenadă etc.) + ultimate
- Celelalte 3 clase de eroi, ecran de alegere a eroului
- Tier-uri de turnuri, cufere cu rarități și șanse afișate
- Mai multe valuri, tipuri de zombi, scalare după numărul de jucători
- Sunete, efecte, asset-uri low-poly CC0

### Pas 3 — multiplayer (Colyseus)
- Mutăm `src/core` într-un pachet comun folosit de client și server
- Serverul rulează `GameSimulation`, primește `Command`-uri, trimite starea
- Clientul: predicție locală pentru mișcarea eroului, interpolare pentru restul

### Pas 4 — mobil (Capacitor)
- Build iOS (apoi Android), blocare landscape, testare performanță pe dispozitiv real
- Reducerea bundle-ului Babylon (importuri țintite în loc de `@babylonjs/core` întreg)
