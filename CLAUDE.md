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

Controale în browser: **WASD / săgeți** mișcare, **1–4** abilități, **M** mină, **B** construcție,
**R** rotește zidul, **Space** / click pune zidul, **Esc** ieșire, **C** magazin, **Enter** începe noaptea.
În consola din dev: `game().state`, `renderer.setCameraOffset(x, y, z)`.

## Arhitectură (REGULĂ IMPORTANTĂ)

Logica jocului este complet separată de randare și de input, ca să poată fi mutată
pe server (Colyseus) în faza 2 fără rescriere.

```
src/
  core/        LOGICA — TypeScript pur. NU importă Babylon, DOM, window, Date.now în step().
    Game.ts        GameSimulation: enqueue(command) → step(dt) → state + drainEvents()
    types.ts       GameState = doar date simple (serializabile JSON)
    commands.ts    Comenzile jucătorilor (singura cale de a modifica starea)
    config.ts      TOATE numerele de echilibrare (eroi, zombi, turnuri, ziduri, zi/noapte, magazin)
    heroDefs.ts    Clasele de eroi, abilitățile (nume, iconiță, cooldown, valori) și skin-urile
    items.ts       Armele și recompensele magazinului (pe rarități)
    map.ts         Harta (case cu variante, brazi, pietre) – generată determinist
    navigation.ts  Flow field: drumul cel mai scurt spre adăpost, ocolind obstacolele
    math.ts        Vec2 pe planul solului (x, z), segmente (ziduri), RNG determinist
    systems/       waves (zi/noapte), heroes, abilities, zombies, towers, barricades,
                   mines, shop, coins, physics
  render/      Babylon.js — doar CITEȘTE starea și desenează
    ModelKit.ts    Trusa de modele: primitive → flat shading → culoare pe vârfuri (uzură,
                   zăpadă pe fețele de sus) → unite într-un mesh per material (PBR mat/metal/glow)
    palette.ts     Paleta „Northrend survival”
    models/        environment (brazi, pietre, case, adăpost), characters (eroi, zombi),
                   structures (turnuri, ziduri, uși, mine, monede)
    Terrain.ts     Teren cu relief, poteci, petice de pământ înghețat (doar vizual)
    World.ts       Decorul + lumini + zi/noapte + umbre + ceață + ninsoare; Prefab (instanțe)
    Fx.ts          Sânge (stropi + pete), trasoare, flăcări de la armă, explozii, inele
    Renderer.ts    Entitățile animate (mers, recul, cădere), camera, fantomele de construcție
  audio/Sfx.ts Sunete generate din cod (Web Audio): împușcături stratificate, vânt, foc, gemete
  input/       Tastatură + joystick virtual → produc comenzi
  ui/Hud.ts    HUD + ecrane (alegere erou, magazin, final) în HTML/CSS peste canvas
  main.ts      Leagă totul + modul de construcție (plasare/mutare ziduri)
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
- **Zi și noapte**: zombii atacă **noaptea**; ziua (scurtă, ~60 s) construiești și te repoziționezi.
  Nopțile devin tot mai lungi pe măsură ce crește nivelul.
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
- Doar **turnuri** și **baricade** (ziduri).
- Zidurile se leagă ușor unul de altul (ca în Minecraft / Ark), se mută și se rotesc ușor,
  și pot primi upgrade (palisadă întărită, **ușă**).
- Fiecare jucător are sloturi și resurse limitate, care cresc în timp
  (ex. +1 slot la fiecare 3 valuri).
- Turnurile au **tier-uri 1–4**, deblocate prin cufere.

### Monede și magazin (gambling)
- Zombii lasă monede pe jos; fiecare jucător le colectează **individual**, mergând peste ele.
- Monedele se folosesc la **magazin**: plătești și, după noroc, primești **nimic**, mine, HP,
  viteză de mișcare, viteză de vindecare, viteză de reparat, turnuri sau alte arme (și skin-uri).
- Rarități: nimic, common, rare, epic, legendary. Șansele se afișează în joc.

### Control pe mobil
- Cameră de sus, înclinată (stil RTS), care urmărește eroul.
- Joystick virtual în stânga (mișcare), butoane de abilități în dreapta.
- Atac automat asupra celui mai apropiat zombie din rază; efect de sânge la impact.
- Mod construcție: tap pe un loc liber → alegi turn sau baricadă.
- Orientare **landscape**.

### Grafică
- Low-poly, performant pe telefon (instanțe pentru obiecte repetate, fără umbre scumpe,
  rezoluție limitată la 1.5x DPR).
- Prototip: forme geometrice simple (capsule, cuburi, cilindri).
- Mai târziu: asset-uri CC0 low-poly (Kenney, Quaternius).

## Direcție artistică: „Northrend survival”

Lizibilitatea din Warcraft 3: The Frozen Throne + materialele și vremea din Ark. Nu copiem modele
sau texturi din acele jocuri.

- **Siluetă întâi**: orice personaj/casă/copac/monstru se recunoaște din contur. Eroi cu umeri lați,
  arme mari, cap lizibil. Monștri cu umeri/cap disproporționat, spate cocoșat, aplecați.
- **Materiale uzate**: lemn crăpat și afumat, piatră cu mușchi înghețat, fier ruginit cu zăpadă în
  îmbinări, blană, os îngălbenit. Fără plastic, fără crom.
- **Lumină de tabără în ceață rece**: ambient albăstrui, umbre moi, focul și ferestrele calde ca
  accent (maxim două accente calde pe ecran, restul rece). Ceață joasă la marginea hărții.
- **Paletă**: zăpadă `#e7eef2`, umbră de zăpadă `#8aa0b0`, lemn ars `#5a3a28`, fier `#3c4650`,
  os `#d9d0bf`, sânge închis `#6b1d24`, foc `#ff8a3d`, gheață magică `#7ec8ff` (în `render/palette.ts`).
- **Tehnic**: doar primitive Babylon + PBR simplu (roughness mare, puțin metal doar pe arme),
  culoare pe vârfuri, 2–3 lumini, fără modele sau texturi externe. Detaliul vine din formă.
- Eroii își schimbă înfățișarea cu nivelul (mai multă blană la 3+, bandă de fier pe umăr la 5+,
  pe ambii umeri la 8+) și cu arma. La moarte îngenunchează.
- Zombii: (1) sălbatic subțire cu brațe lungi (walker/runner), (2) brută cu umeri de blană și
  bâtă de os, (3) „abominație” înaltă cu coarne de gheață și piept de os (boss). Piele
  cenușiu-albăstruie, ochi cu punct de lumină rece, sânge închis.

## Decizii de implementare

- **Zi și noapte**: ziua (60 s; prima 45 s) construiești, noaptea atacă zombii. Noaptea durează
  75 s + 15 s pe fiecare noapte (noaptea 10 ≈ 3,5 min). Zombii vin în **hoarde** (2 + noapte/2),
  răspândite în primele 75% din noapte. În zori, zombii rămași fug (fără monede). 10 nopți = victorie.
- **Două resurse**: 🪵 *lemn* pentru construcții (start 70 + venit în fiecare zori) și
  🪙 *monede* pentru magazin (cad din zombi).
- **Magazinul norocului** (gambling, 25 monede): Nimic 20%, Comun 46%, Rar 23%, Epic 9%,
  Legendar 2% (afișate în joc). Recompense: mine, +HP maxim, +viteză de mers, regenerare,
  reparat mai rapid, loc de turn în plus, tier de turn, arme noi, skin-uri, lemn.
  Bonusurile de viteză sunt plafonate. Nu se dă ceva ce ai deja.
- **Arme** (`items.ts`): țeava ruginită → pușcă de vânătoare / flintă cu alice (rar) →
  mitralieră din țevi / arbaletă de os (epic) → lancea de gheață (legendar, încetinește).
- **Abilități**: fără abilități de „viteză” (Foc rapid și Concentrare au fost înlocuite cu
  Molotov și Glonț de gheață). Țintesc automat. Ultimate la nivelul 4.
- **Ziduri = segmente** (2,6 m) care se lipesc cap la cap; pot fi mutate, rotite (45°), întărite
  (palisadă pe piatră) sau transformate în **ușă** (eroii trec, zombii nu). Zidurile opresc și
  eroii. Demolarea dă înapoi 50% din lemn. Zombii sparg zidul din drumul lor; eroii din
  apropiere îl repară automat (Tank ×3, plus bonusul din magazin).
- **Mine**: din magazin; le pui unde stai (M / 💣); explodează când trece un zombie.
- **Sloturi**: 3 turnuri + 8 ziduri; la fiecare 3 nopți +1 turn și +4 ziduri.
- **Zombi**: walker, runner (din noaptea 3), brute (din noaptea 4), boss la nopțile 5 și 10.
  Navighează cu flow field; un zombie blocat > 2 s poate trece prin obstacole.
- Fiecare jucător în plus: +50% zombi și +25% HP la zombi.

## Roadmap

### Pas 1 — prototip single-player ✅
- [x] Proiect Babylon.js + TS + Vite, arhitectură core / render / input / ui
- [x] Teren alb cu adăpost în centru (are HP), case și brazi cu coliziuni
- [x] Erou Assault Rifle: joystick virtual + tastatură, atac automat pe cel mai apropiat zombie
- [x] Zombii apar la marginea hărții, merg spre adăpost (sau spre erou, dacă e aproape) și atacă
- [x] Un tip de turn, plasat în mod construcție
- [x] Valuri cu pauză de 60 s și cronometru (+ buton „Pornește acum”)
- [x] Monede care cad din zombi și se colectează mergând peste ele
- [x] Ecran de game over / victorie + „Joacă din nou”

### Pas 2 — gameplay complet single-player ✅
- [x] Ecran de alegere a eroului; 4 clase cu câte 3 abilități + ultimate, XP și nivel
- [x] Tier-uri de turnuri 1–4 + upgrade; 4 tipuri de zombi; navigare cu flow field

### Pas 2.5 — grafică, atmosferă, zi/noapte ✅
- [x] Grafică „Northrend survival” din primitive + PBR + culoare pe vârfuri
- [x] Teren cu relief, poteci, pietre; brazi în trepte; 7 case diferite; adăpost cu foc și banner
- [x] Eroi supraviețuitori cu echipament după nivel și armă; 3 siluete de zombi animate
- [x] Ciclu zi/noapte (lumini, ceață, ninsoare), umbre moi, glow pentru foc și ferestre
- [x] Sânge (stropi + pete pe zăpadă), explozii, trasoare, flacăra armei
- [x] Sunete: împușcături stratificate, vânt cu rafale, foc, gemete, reverb
- [x] Magazin cu gambling, arme, mine; ziduri care se lipesc, se mută, se rotesc, uși
- [ ] Progres între runde (skin-uri și deblocări păstrate)
- [ ] Optimizare pe telefon real (umbre/glow ajustabile după performanță)

### Pas 3 — multiplayer (Colyseus)
- Mutăm `src/core` într-un pachet comun folosit de client și server
- Serverul rulează `GameSimulation`, primește `Command`-uri, trimite starea
- Clientul: predicție locală pentru mișcarea eroului, interpolare pentru restul

### Pas 4 — mobil (Capacitor)
- Build iOS (apoi Android), blocare landscape, testare performanță pe dispozitiv real
- Reducerea bundle-ului Babylon (importuri țintite în loc de `@babylonjs/core` întreg)
