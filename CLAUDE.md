# Iarna Morților — survival tower defense co-op (3D, mobil)

Joc 3D pentru mobil (iOS întâi, apoi Android): 2–4 jucători co-op apără o **mină de plasmă**
extraterestră (pe care o vor zombii), într-un sat de munte înzăpezit.

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

Jocul pornește cu **meniul principal** (nume, dificultate Easy/Medium/Hard/Nightmare, sunet, muzică),
apoi alegerea eroului. Sunetul se schimbă doar din meniu (☰ / Esc = pauză).
Controale în browser: **WASD / săgeți** mișcare, **click ținut** trage spre cursor,
**Space** trage (spre cursor sau automat), **R** reîncarcă (sau rotește zidul la plasare), **B** construcție
(**1/2/3** turn / zid / mină), **Enter** confirmă plasarea sau începe noaptea, **Esc** pauză, **C** magazin.
Pe telefon: joystick în stânga; ții degetul oriunde pe ecran = tragi acolo; în dreapta 2 butoane —
🔨 construcție și ✛ tragere (ții apăsat = ochire automată, tragi cu degetul = ochești tu).
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
    heroDefs.ts    Clasele de eroi (pasiva fiecăruia) și skin-urile. Abilitățile sunt scoase în beta.
    items.ts       Armele (damage, încărcător, reîncărcare, alice) și recompensele magazinului
    map.ts         Harta (case cu variante, brazi, pietre) – generată determinist
    navigation.ts  Flow field: drumul cel mai scurt spre mină, ocolind obstacolele
    math.ts        Vec2 pe planul solului (x, z), segmente (ziduri), RNG determinist
    systems/       waves (zi/noapte, ardere în zori), heroes (ochit, muniție, gloanțe),
                   zombies (aggro pe turnuri, răcire/înghețare, proiectile scuipate, zburători),
                   towers (5 tipuri, niveluri, abilități, proiectile `Shell`, foc pe jos, HP),
                   barricades, mines, shop (+ cufărul boss-ului), coins (+ cufere), physics
  render/      Babylon.js — doar CITEȘTE starea și desenează
    ModelKit.ts    Trusa de modele: primitive → flat shading → culoare pe vârfuri (uzură,
                   zăpadă pe fețele de sus) → unite într-un mesh per material (PBR mat/metal/glow)
    palette.ts     Paleta „Northrend survival”
    models/        environment (brazi, pietre, case, mina de plasmă), characters (eroi, zombi),
                   structures (turnuri pe tip/nivel, proiectile, ziduri, uși, mine, monede, cufăr)
    Terrain.ts     Teren cu relief, poteci, petice de pământ înghețat (doar vizual)
    World.ts       Decorul + lumini + zi/noapte + umbre + ceață + ninsoare; Prefab (instanțe)
    Fx.ts          Particule (sânge, scântei, așchii, venin, piatră, praf, fum, plasmă), pete de
                   sânge, urme de pași, trasoare, fulgere, explozii, inele
    Renderer.ts    Entitățile animate (mers cu genunchi, recul, reîncărcare, ardere, cădere,
                   înghețare), proiectilele turnurilor în arc, prăbușirea construcțiilor,
                   camera, fantomele de construcție (cu „amprenta” pe sol)
  audio/Sfx.ts   Sunete generate din cod (Web Audio): împușcături pe armă, sunet pe tip de turn,
                 explozii, dărâmare, pași, reîncărcare, atac zombi, păcănele (clopote, sirenă,
                 monede), vânt, foc
  audio/Music.ts Muzică procedurală: strat calm + strat de teroare, amestecate după pericol
  input/       Tastatură, joystick virtual (mișcare), FireStick (buton de tras + ochire) → comenzi
  ui/Hud.ts    HUD + ecrane (meniu, pauză, alegere erou, magazin, final) în HTML/CSS peste canvas
  main.ts      Leagă totul + modul de construcție + ochirea spre mouse / deget + pauza
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
- 2–4 jucători co-op apără **mina de plasmă** (resurse extraterestre pe care le vor zombii).
  Mină distrusă = game over. Mina e mică, ca să poată fi înconjurată ușor cu ziduri.
- **Zi și noapte**: zombii atacă **noaptea**; ziua (scurtă, ~60 s) construiești și te repoziționezi.
  Nopțile devin tot mai lungi pe măsură ce crește nivelul.
- O singură hartă, mărime medie: **sat de munte iarna** — zăpadă, brazi, case de lemn,
  mina în centru.
- Dificultatea valurilor crește cu numărul de jucători și cu nivelul ales (Easy → Nightmare).

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
- Construiești mereu o **arbaletă** (turnul de bază); din ea faci upgrade de nivel (1–3) sau o
  transformi în **Rachete, Tun, Tesla sau Gheață**. Fiecare tip are o abilitate cu cooldown.

### Monede și magazin (gambling)
- Zombii lasă monede pe jos; fiecare jucător le colectează **individual**, mergând peste ele.
- Monedele se folosesc la **magazin**: plătești și, după noroc, primești **nimic**, mine, HP,
  viteză de mișcare, viteză de vindecare, viteză de reparat, turnuri sau alte arme (și skin-uri).
- Rarități: nimic, common, rare, epic, legendary. Șansele sunt într-un „ⓘ” discret în magazin;
  în prim-plan e ce ai câștigat deja.

### Control pe mobil
- Cameră de sus, înclinată (stil RTS), care urmărește eroul.
- Joystick virtual în stânga (mișcare); tragi ținând degetul pe ecran (spre acel punct) sau cu
  butonul ✛; efect de sânge la impact.
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
- Zombii (după imaginile de referință ale proprietarului): (1) strigoi înghețat înfășurat în
  zdrențe, cu gheare lungi (walker); (2) târâtor de gheață în patru labe, cu spini de cristal
  (runner); (3) trol de gheață cu mantie de blană, țurțuri și bâtă din trunchi (brute);
  (4) lich-schelet cu craniu cu coarne, cușcă toracică, mantie cu țurțuri și coasă de os (boss).
  Piele cenușiu-albăstruie, ochi cu punct de lumină rece, sânge închis.
- Mina de plasmă: movilă de stâncă, capac de fier cu grilaj, capră de lemn cu scripete,
  cristale verzi-cyan care pulsează (accentul rece), lângă un foc de tabără (accentul cald).

## Decizii de implementare

- **Zi și noapte**: ziua (60 s; prima 45 s) construiești, noaptea atacă zombii. Noaptea durează
  75 s + 15 s pe fiecare noapte (noaptea 10 ≈ 3,5 min). Zombii vin în **hoarde** (2 + noapte/2),
  răspândite în primele 75% din noapte. În zori, zombii rămași ard. 10 nopți = victorie.
- **Meniu**: nume (apare în HUD), dificultate, sunet și muzică (salvate în localStorage). Pauză cu ☰ / Esc.
- **Dificultate** (`CONFIG.difficulty`): Easy = jocul de bază; Medium ×1,12 HP / ×1,1 zombi /
  ×1,1 damage; Hard ×1,3 / ×1,25 / ×1,2 și 90% lemn; Nightmare ×1,6 / ×1,45 / ×1,4 și 80% lemn.
- **Două resurse**: 🪵 *lemn* pentru construcții (start 70 + venit în fiecare zori) și
  🪙 *monede* pentru magazin (cad din zombi).
- **Magazinul norocului** (păcănele, 30 monede) — riscant, dar merită: Nimic 38%, Comun 40%,
  Rar 15%, Epic 6%, Legendar 1%. Bonusurile sunt mici (viață max +5% / +10%, viteză +4% / +6%);
  premiile mari: arme, nivelul 3 al turnurilor, loc de turn, câștig în monede (75 / 150 / 400).
  Fiecare recompensă (în afară de nimic/lemn/mine/monede) se câștigă **o singură dată pe rundă**.
  Rolele se opresc pe rând în ~3 s; sunete de cazino (clicuri, clopote, sirenă la jackpot).
- **Cufărul boss-ului**: lich-ul învins (nu ars în zori) lasă un cufăr; primul erou care trece
  peste el primește ceva epic/legendar (`CHEST_POOL`) pe care nu-l are.
- **Arme** (`items.ts`): țeava ruginită → pușcă de vânătoare / flintă cu alice (rar) →
  mitralieră din țevi / arbaletă de os (epic) → lancea de gheață (legendar, încetinește).
- **Beta fără abilități**: doar 2 butoane (construcție + tragere). Fiecare clasă are o pasivă
  (Healer: aură de vindecare; Sniper: critice + străpunge; Tank: armură, pușcă cu alice, repară ×3).
- **Tragere**: ochești tu (drag pe buton / mouse) sau automat (ții apăsat); gloanțele se opresc
  în case, copaci, pietre. Fiecare armă are încărcător și timp de reîncărcare (auto la 0).
  Mergi mai încet cât tragi.
- **Turnuri** (`CONFIG.tower`): construiești o arbaletă (30 lemn); upgrade de nivel 2 (45) și 3 (80,
  doar după deblocare din magazin/cufăr) sau transformare (păstrează nivelul):
  Arbaletă (o țintă; abilitate: săgeată grea prin 3 zombi), Rachete (damage mare; racheta mare
  se sparge în mini-rachete), Tun (explozie pe zonă, lent; ghiuleaua lasă foc), Tesla (fulger;
  laser prin toată linia), Gheață (pasiv -30% viteză și -30% viteză de atac în rază; nova care
  îngheață). Proiectilele zboară cu adevărat (`state.shells`) și lovesc la sosire.
  Turnurile au HP: zombii loviți de un turn îl atacă întâi (dacă e la < 12 m), apoi merg spre
  mină și sparg zidurile din drum. Turnurile se repară doar ziua. Nimeni nu trece prin ele.
  Construcțiile distruse se prăbușesc cu praf.
- **Ziduri = segmente** (2,6 m) care se lipesc cap la cap; pot fi mutate, rotite (45°), întărite
  (palisadă pe piatră) sau transformate în **ușă** (eroii trec, zombii nu). Zidurile opresc și
  eroii. Demolarea dă înapoi 50% din lemn. Zombii sparg zidul din drumul lor; eroii din
  apropiere îl repară automat (Tank ×3, plus bonusul din magazin).
- **Mine**: din magazin; le pui unde stai (M / 💣); explodează când trece un zombie.
- **Sloturi**: 3 turnuri + 8 ziduri; la fiecare 3 nopți +1 turn și +4 ziduri.
- **Zombi**: walker, runner (rapid, din noaptea 2), spitter (scuipă de la distanță, din noaptea 3),
  flyer (zboară peste ziduri, din noaptea 4), brute (din noaptea 4), boss la nopțile 5 și 10.
  Navighează cu flow field; un zombie blocat > 2 s poate trece prin obstacole.
- **Zori**: zombii rămași iau foc și mor încet (fără monede), inclusiv boss-ul.
- **Monede**: cad doar uneori (șansă pe tip de zombie) și dispar după 30 s (clipesc la final).
- Zombii: +33% HP pe noapte, 14 + 8/noapte (×dificultate). Botul de test câștigă ~4/6 pe Easy,
  ajunge la noaptea ~6 pe Medium, ~5 pe Hard, ~4–5 pe Nightmare.
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
- [x] Ochit manual, muniție + reîncărcare, 2 butoane; zombi noi (spitter, flyer); ardere în zori
- [x] Muzică dinamică calm/teroare, pași, păcănele + jackpot; post-procesare (bloom, ACES)
- [x] Meniu principal (nume, dificultate, sunet), pauză; HUD compact; resurse jos
- [x] 5 turnuri cu abilități și niveluri; turnurile au HP și sunt atacate; mina de plasmă
- [x] Zombi redesenați după imagini de referință; cufărul boss-ului; dărâmare cu praf
- [ ] Abilitățile eroilor înapoi (după beta), echilibrate
- [ ] Progres între runde (skin-uri și deblocări păstrate)
- [ ] Optimizare pe telefon real (umbre/glow ajustabile după performanță)

### Pas 3 — multiplayer (Colyseus)
- Mutăm `src/core` într-un pachet comun folosit de client și server
- Serverul rulează `GameSimulation`, primește `Command`-uri, trimite starea
- Clientul: predicție locală pentru mișcarea eroului, interpolare pentru restul

### Pas 4 — mobil (Capacitor)
- Build iOS (apoi Android), blocare landscape, testare performanță pe dispozitiv real
- Reducerea bundle-ului Babylon (importuri țintite în loc de `@babylonjs/core` întreg)
