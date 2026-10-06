# Iarna Morților — survival tower defense co-op (3D, mobil)

Joc 3D pentru mobil (iOS întâi, apoi Android): 2–4 jucători co-op, într-un sat de munte înzăpezit.
Două moduri: **Apără mina** (o mină de plasmă extraterestră pe care o vor zombii) și
**Supraviețuire** (contează doar să rămâi tu în viață: foame, frig, foc, vânătoare, ferme).

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
npm run test:smoke # test lung (~2 min): o rundă întreagă (campanie grăbită, asaltul boșilor, valul fără sfârșit)
npm run typecheck
npm run build      # typecheck + build de producție în dist/
```

Jocul pornește cu **meniul principal** (scena 3D de noapte în fundal, muzică eroică, fulgi): logo de
gheață în stânga sus, în dreapta un panou de sticlă cu nume, mod de joc (carduri), dificultate
Easy/Medium/Hard/Nightmare (verde → roșu) și butonul auriu JOACĂ; jos: 🏆 clasament, sunet, muzică,
grafică, ❔ Cum se joacă; apoi alegerea eroului.
Sunetul se schimbă doar din meniu (☰ / Esc = pauză; sunet oprit = o linie roșie peste ☰). Tap / clic
scurt pe o construcție de-a ta (turn, zid, foc, fermă) o **selectează** (inel + contur auriu + bara de viață);
**apăsare lungă** (~0,45 s) sau al doilea tap pe ea = meniul ei. Tap pe zăpadă = deselectezi.
Degetul de pe joystick nu deschide niciodată meniuri. Telefonul sună / aplicația trece în fundal =
pauză automată (noaptea și păcănelele stau pe loc).
Controale în browser: **WASD / săgeți** mișcare, **click ținut** trage spre cursor,
**Space** trage (spre cursor sau automat), **R** reîncarcă (sau rotește zidul la plasare), **B** construcție
(**1/2/3/4** turn / zid / mină / foc; în afara construcției 1–4 = locurile din bara rapidă), **Enter** confirmă plasarea sau începe noaptea, **Esc** pauză,
**C** magazin, **E** mănânci carne friptă, **F** pui carne crudă pe foc, **I** inventar, **L** meniul de nivel.
Pe telefon: joystick în stânga; ții degetul oriunde pe ecran = tragi acolo; în dreapta 2 butoane —
🔨 construcție și ✛ = **butonul principal**, care face ce face obiectul din mână: arma trage (arată
gloanțele; ții apăsat = ochire automată, tragi cu degetul = ochești tu), târnăcopul lovește (doar
iconița, fără gloanțe), undița aruncă / trage peștele („TRAGE 2/5”), lanterna se aprinde / stinge
(arată bateria; cercul din jur se golește). Nu mai există buton separat de acțiune; peștele se
vinde singur când ajungi la tarabă.
Bara de jos (stil Ark) = 4 locuri: armă, târnăcop, undiță, lanternă, mine, mâncare, pește.
Apăsat pe loc = îl iei în mână / îl folosești (încă o dată = înapoi la armă). În 🎒 (grilă de
iconițe) **tragi cu degetul** un obiect pe un loc din bară (sau tap pe obiect, apoi pe loc); tragi
un loc din bară în afara ei = îl golești; între locuri = se schimbă între ele.
HUD stânga sus: nume, nivel, viață, XP, lemn și aur. **Nivelul e un buton**: când ai puncte de pus,
pulsează auriu cu „+1”; apăsat = meniul de nivel (tăiat / minerit / pescuit / tras, cu pasivele de la
treptele 3 și 5 și ce mai deblochezi). În 🎒, în dreapta: **armura** (4 locuri, butoane Piele / Metal). Sus: un singur ceas ca în Warcraft 3 — soare
sau lună într-un inel auriu care se umple cât trece ziua / noaptea, iar lângă el un singur timp care
scade (cele 30 de minute); fără „Ziua 2” / „Noaptea 1” și fără numărul de zombi. Animalele rănite au bară de viață deasupra.
Meniul: 🖥 Grafică Înaltă / Medie / Mică.
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
    map.ts         Harta (case, brazi care se pot tăia, pietre, balta, taraba la ~12 m de mină) – deterministă
    navigation.ts  Flow field: drumul cel mai scurt spre mină (sau spre eroi, în Supraviețuire)
    math.ts        Vec2 pe planul solului (x, z), segmente (ziduri), RNG determinist
    systems/       waves (zi/noapte, vreme, ardere în zori, aprovizionare), heroes (ochit, muniție
                   cu rezervă, gloanțe care se opresc la punctul ochit, cufărul împușcat),
                   survival (foame, frig, focuri, gătit, animale, ferme, obiecte pe jos, inventar),
                   gather (târnăcop: brazi / zăcăminte / animale, pescuit în baltă, vânzare la tarabă),
                   hotbar (bara rapidă: 4 locuri configurabile, armele tale, unealta din mână),
                   zombies (aggro pe turnuri, răcire/înghețare, proiectile scuipate, zburători),
                   towers (5 tipuri, niveluri, abilități, proiectile `Shell`, foc pe jos, HP),
                   barricades, mines, shop (+ cufărul boss-ului), coins (+ cufere), physics,
                   progression (abilitățile de la level up, deblocări pe nivel, armuri)
  render/      Babylon.js — doar CITEȘTE starea și desenează
    ModelKit.ts    Trusa de modele: primitive → culoare pe vârfuri (uzură, zăpadă pe fețele de sus)
                   → unite într-un mesh per material. Suprafața (lemn, piatră, zăpadă, pânză, piele,
                   ace) se ghicește după culoare și primește o hartă de relief CC0 reală; formele
                   organice au umbrire netedă (pietrele deformate cu zgomot), lemnul și fierul plate
  assets/normals/  Hărți de relief CC0 din `@pmndrs/assets` (vezi README-ul din folder)
  assets/sfx/      Vocile zombilor / boșilor / eroului (`tools/zombie_voices.py`) și efectele
                   „realiste” (`tools/sfx_synth.py`): arme, reîncărcare, tuburi, târnăcop, drujbă,
                   pescuit, gheare / bâte / mușcături, explozii, pași (MP3)
  assets/music/    8 piese stereo generate de `tools/music_synth.py` (meniu, zi A/B, noapte în 2
                   straturi, boss, Regele Iernii, val fără sfârșit)
    palette.ts     Paleta „Northrend survival”
    models/        gathering (lac cu copcă, tarabă, zăcăminte, târnăcop, undiță),
                   environment (brazi, pietre, case, mina de plasmă), characters (eroi cu glugă
                   și mantie + 12 skin-uri amuzante, zombi), structures (turnuri, proiectile,
                   ziduri în 3 stări, cufăr cu capac, turnuri de elită nv. 4–5), survival (animale,
                   ferme, foc, fântână, obiecte, schelete de dinozaur, copaci morți); gathering are și
                   zăcământul de ulei și drujba; characters are armurile și cele 8 creaturi noi
    SurvivalView.ts Focuri, ferme, animale, obiecte pe jos, cufărul care se deschide
    Terrain.ts     Teren cu relief, poteci, petice de pământ înghețat (doar vizual)
    World.ts       Decorul + lumini + zi/noapte + umbre + ceață + ninsoare; Prefab (instanțe)
    Fx.ts          Particule (sânge, scântei, așchii, venin, piatră, praf, fum, plasmă), pete de
                   sânge, urme de pași, trasoare, fulgere, explozii, inele
    Renderer.ts    Entitățile animate (mers cu genunchi, recul, reîncărcare, ardere, cădere,
                   înghețare), proiectilele turnurilor în arc, prăbușirea construcțiilor,
                   camera, fantomele de construcție (cu „amprenta” pe sol)
  audio/Sfx.ts   Sunete generate din cod (Web Audio) + vocile MP3 (gemete, răgete, țipete, horcăit,
                 „ugh” când ești lovit): împușcături pe armă, sunet pe tip de turn,
                 explozii, dărâmare, pași, reîncărcare, atac zombi, păcănele (clopote, sirenă,
                 monede), vânt, foc
  audio/MusicTracks.ts  Piesele din assets/music pe stări: meniu → zi (calmă, A/B pe rând) →
                 noapte (baza + stratul de luptă, sincrone; lupta urcă cu pericolul) → boss (Regele
                 Iernii are piesa lui) → val fără sfârșit; fade între ele, decodare la nevoie (max 4)
  audio/Music.ts Rezervă până se încarcă piesele — muzică procedurală: temă eroică în meniu (cor, alămuri, tobe de război);
                 în joc 2 straturi fără melodie (nu acoperă arbaleta): între valuri drone de vânt +
                 acord rar; în val puls jos și energic (tobă mare, bas în optimi/șaisprezecimi,
                 tom-uri, „BRAAM”); tobă rară când o brută lovește un zid; boss = vântul tace +
                 notă ținută; victorie / game over = stinger, apoi liniște
tools/zombie_voices.py  Sintetizator de voce (formanți, ca Klatt): puls de glotă cu jitter, horcăit,
                 respirație, 5 rezonatoare care se mută între vocale → MP3 (numpy, scipy, ffmpeg);
                 câte o voce pe fiecare tip de zombi și boss (țipete, chicoteli, răgete, incantații)
tools/sfx_synth.py      Efecte: rezonanțe modale, zgomot filtrat, granule, reverb de exterior
tools/music_synth.py    Muzică: coarde, alămuri, cor din formanți, harpă, pian, clopote, taiko,
                 reverb de sală; buclele se închid fără cusătură (`python3 tools/music_synth.py [nume]`)
  input/       Tastatură, joystick virtual (mișcare), FireStick (buton de tras + ochire) → comenzi
  ui/Hud.ts    HUD + ecrane (meniu, pauză, alegere erou, magazin, clasament, final) în HTML/CSS
  ui/leaderboard.ts  Clasamentul (localStorage): cei mai buni 5 și ultimele 5, pe mod și dificultate
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
- **Tehnic**: primitive Babylon + PBR (roughness mare, puțin metal), culoare pe vârfuri, 2–3 lumini.
  Singurele resurse externe: hărți de relief CC0 (`src/assets/normals`), fără modele 3D externe.
  Calitate Înaltă: umbre 2048 moi, SSAO, claritate, DPR până la 2; Medie (implicit pe telefon):
  umbre 1024, fără SSAO; Mică: umbre 512, fără bloom/granulație, DPR 1. Gradare de culoare: umbre
  reci, lumini calde.
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

- **Runda** (`CONFIG.run`, `systems/waves.ts`, `state.stage`), după ideea lui Andrei (Survival din Warframe):
  1. **Campania — 30 de minute**: timpul de lângă ceasul de sus („29:12”) numără invers; între timp zi și
     noapte ca înainte: ziua 45 s (prima 30 s) construiești, noaptea 150 s + 5 s pe noapte (~8 nopți
     încap). Zombii vin în **hoarde** (3 + noapte/2) în primele 75% din noapte; în zori ard.
     Boșii campaniei: Matca (noaptea 3), Lich-ul (noaptea 6). Sub un minut, ceasul clipește roșu.
  2. **Asaltul boșilor — fără limită de timp**: la 0:00 se face noapte și boșii vin unul după altul
     (Yeti → Vrăjitoarea → Colosul → **Regele Iernii**, cel mai greu), fiecare cu escortă și zombi
     care tot vin cât trăiește. Între boși: 25 s de pauză (zi scurtă: lemn, gloanțe, reparat).
     Lângă ceas: „☠ 2/4” (boși învinși).
  3. **Valul fără sfârșit**: după ultimul boss, un val nou la 35 s, tot mai mare și mai puternic,
     cu un boss la întâmplare la fiecare 5 valuri. Ceasul arată ♾ și „4:37” — cât reziști. Nu mai există
     victorie: jocul se termină doar când cazi (sau cade mina).
  **Clasamentul** pune întâi rundele ajunse în valul final (după timpul de acolo), apoi pe cele din
  asalt (după boșii învinși), apoi campania (după cât timp au rezistat).
- **Regele Iernii** (`frostKing`, 6500 HP): lich uriaș cu coroană de țurțuri și inimă de gheață;
  bate din picior când ești aproape, altfel ridică morții (5 strigoi, 10 înfuriat), aruncă salve
  de 3 țurțuri la 4,5 s, la jumătate de viață se înfurie.
- **Meniu**: nume (apare în HUD), mod, dificultate, sunet și muzică (salvate în localStorage). Pauză cu ☰ / Esc.
- **Moduri**: *Apără mina* (mina cade = pierzi) și *Supraviețuire* (zombii te vânează pe tine oriunde,
  flow field spre eroi; mina e decor; hoarde ×0,8, HP ×0,85). Zi / noapte în ambele moduri.
- **Lovit**: eroul tresare (se apleacă pe spate, se smucește, e împins), camera tresare, geme.
- **Lângă mină** nu e nicio construcție a hărții (taraba e la ~12 m, focul de start doar în
  Supraviețuire, la ~9 m): acolo îți faci zidurile și turnurile.
- **Moartea**: cine cade NU reînvie singur. Doar un coleg care stă lângă el 4 s îl ridică (cu 40%
  viață). Toți căzuți = pierzi (în ambele moduri); singur = mori = game over.
- **Supraviețuire** (`CONFIG.survival`): foamea (se golește în 4 min), setea (în 5 min; bei la baltă / fântână, din canistră
  sau topești zăpadă lângă un foc) și căldura
  (−0,45/s, ×vreme, ziua ×0,6), afișate ca în Ark: 3 iconițe semi-transparente pe dreapta
  (pulpă / picătură / flacără) care se golesc de sus în jos și clipesc sub 20%;
  la 0 pierzi 3 HP/s. Focul (15 lemn, max 3) încălzește în 4,5 m, arde lemnul (1/s ×vreme; +5 lemn =
  +30%), gătește carnea în 15 s (apare pe jos). Eticheta de deasupra focului arată cât lemn mai are
  (ca la mină). Coteț / țarc mic (40 lemn, max 2, max 3 animale; încape în baza ta); găinile și
  porcii se taie cu târnăcopul pentru carne. Carne crudă: +12 foame, −6 HP; friptă: +25 foame
  (un sfert), +10 HP; pește: +14…30 foame.
  **Fântâna** (🪣, 30 lemn, max 2): puț de piatră cu acoperiș și găleată, are mereu apă; lângă ea
  (2,2 m) bei repede și canistrele se umplu singure; din meniul ei faci **canistre** noi (10 lemn,
  max 3). **Canistra** (🧴, ai una la start, în bara rapidă): o apăsare = setea la 100%; ține 2
  plinuri, apoi o umpli la fântână sau pe malul bălții.
- **Animale sălbatice** (ambele moduri, ziua, la 16–34 m de mină, departe de eroi): căprioare (fug,
  12 aur), urși (atacă, max 2, 40 aur). Aurul cade pe jos ca monede, plus carne.
- **Unelte** (`CONFIG.gather`, unealta în mână + ✛): târnăcopul (ținut cu ambele mâini) lovește
  ținta din raza brațului (animal > zăcământ > brad) la 0,7 s (brad), 1 s (piatră), 0,6 s (animal),
  sau în gol la 0,8 s; îl ridică peste umăr, izbește, corpul se apleacă odată cu lovitura.
  Lanterna: bateria ține ~6 min aprinsă, se reîncarcă în ~4 min stinsă. Brad: +1 lemn pe lovitură, cade după 50 și dispare.
  Zăcăminte de argint (8 lovituri, 18 aur) și aur (12 lovituri, 45 aur) apar ziua aleator (3 pe zi,
  max 6); se micșorează la fiecare lovitură și se sparg. Cu târnăcopul / undița în mână nu tragi.
- **Pescuit** (undița în mână, ziua, de pe malul bălții — apă deschisă, 7 m rază, cu ponton și stuf): arunci undița,
  peștele mușcă după 4–10 s (telefonul vibrează), apoi te lupți cu el: apeși repede ✛, iar el se
  smucește la 0,7–1,5 s (vibrează, butonul tremură, apa plescăie) și îți smulge firul înapoi:
  biban (4 trageri în 6 s, smucitură −1, 8 aur), păstrăv (6 / 7 s / −1,5, 15), știucă (9 / 9 s /
  −2, 28), somn (13 / 11 s / −3, 60, rar). Butonul arată „TRAGE 2/5”. Vibrația merge pe Android;
  pe iPhone o vom face cu Capacitor Haptics. Peștii se vând singuri la taraba negustorului (la ~12 m de mină).
- **Muniție** (`CONFIG.ammo`): încărcător + rezervă (8 încărcătoare la start, max 12). Zombii lasă
  cutii (30%, 0,6 încărcător), plus 3 încărcătoare în fiecare zori și din cufărul boss-ului.
- **Vremea** se schimbă la fiecare zi / noapte: senin, ninsoare, viscol (ninsoare deasă, nu filtru pe
  ecran; turnurile bat la 70% din rază, Tesla nu; urmele zombilor se văd),
  ger (frigul ×2,2), lapoviță (focul arde ×2), vânt (mergi mai greu). Nu se mai afișează (se vede în joc).
- **Clasament**: la final de rundă se salvează nume, mod, dificultate, etapa, timpul din campanie,
  boșii învinși, timpul din valul fără sfârșit, nopți, kill-uri.
- **Dificultate** (`CONFIG.difficulty`, HP / număr / damage zombi, lemn, damage turnuri): Easy ×0,9 /
  ×0,9 / ×1, 100% lemn, turnuri ×1; Medium ×1,1 / ×1,08 / ×1,08, turnuri ×0,85; Hard ×1,12 / ×1,1 /
  ×1,1, 90% lemn, turnuri ×0,8; Nightmare ×1,22 / ×1,15 / ×1,2, 85% lemn, turnuri ×0,65.
  Turnurile singure NU țin o noapte de la Medium în sus: trebuie să tragi și tu. Hard: noaptea ceața
  se strânge spre mină. Nightmare: fugarii sunt invizibili în întuneric (îi vezi doar lângă un foc
  aprins, în raza unui Tesla sau la 3,5 m de un erou; urmele lor se văd).
- **Două resurse**: 🪵 *lemn* pentru construcții (start 80 + venit în fiecare zori + brazi tăiați) și
  🪙 *aur / monede* pentru magazin (zombi, vânat, zăcăminte, pește vândut).
- **Magazinul norocului** (păcănele, 30 monede) — riscant, dar merită: Nimic 38%, Comun 40%,
  Rar 15%, Epic 6%, Legendar 1%. Bonusurile sunt mici (viață max +5% / +10%, viteză +4% / +6%);
  premiile mari: arme, nivelul 3 al turnurilor, loc de turn, câștig în monede (75 / 150 / 400).
  Fiecare recompensă (în afară de nimic/lemn/mine/monede) se câștigă **o singură dată pe rundă**.
  Rolele se opresc pe rând în ~3 s; sunete de cazino (clicuri, clopote, sirenă la jackpot).
- **Cufărul boss-ului**: lich-ul învins (nu ars în zori) lasă un cufăr de lemn ars legat cu fier, pe
  jumătate îngropat, cu balama de os; îl **împuști** (60 HP) ca să se deschidă: ceva epic/legendar
  (`CHEST_POOL`) + 60 lemn + 3 încărcătoare + 3 carne friptă. Lumina e chihlimbar, nu aur.
- **Ziduri în 3 stări** (aceeași piesă, din țăruși, scânduri și zăpadă — fără piatră): întreg,
  crăpat (< 60%), dărâmat (0 HP: rămân cioturi, nu mai oprește pe nimeni). Eroii îl repară (Tank ×3);
  la 40% se ridică la loc.
- **Skin-uri** (12, amuzante): Schiorul, Vikingul, Vecinul zombi, Cavalerul, Bucătarul (rare),
  Vârcolacul, Omul de zăpadă, Yeti, Cap de dovleac (epice), Moș Crăciun, Astronautul, Pinguinul (legendare).
- **Gloanțe pe clasă**: pușca = glonț scurt de fier cu urmă caldă; sniper = trasor lung și rece;
  alicele Tank-ului = undă de praf și zăpadă la izbitură. Glonțul eroului se oprește la punctul
  apăsat, în primul zombi sau în zăpadă. Sunetul turnurilor e la impact (Tesla: la atingere).
- **Fără anunțuri** de tip „Triple Kill / Rampage” (scoase: sunau urât).
- **Vocea zombilor**: fișiere MP3 generate offline de `tools/zombie_voices.py` (sinteză de vorbire cu
  formanți: gemete „mmm-uuu-aaa”, răgete „AAARGH”, brute cu gât uriaș, țipete de fugar, bolborosit de
  scuipător, horcăit de moarte); la atac + șuieratul ghearelor / bâtei + lovitură surdă. Gem tot mai
  des și mai tare cu cât se apropie. Dacă fișierele nu s-au încărcat, cântă vocea sintetizată din cod.
  Fiecare tip are vocea lui (fugarul țipă, umflatul bolborosește, săpătorul țăcăne, șamanul
  incantează, Matca șuieră, Yeti-ul răcnește, Vrăjitoarea chicotește, Colosul geme ca piatra,
  Regele Iernii râde) și lovitura lui (gheare, bâtă, mușcătură, zid). Fiecare boss se anunță cu vocea lui.
- **Sunete realiste** (MP3 din `tools/sfx_synth.py`, cu rezervă din cod): fiecare armă are împușcătura
  ei (pistol, pușcă, asalt, alice, arc, lance), reîncărcare în 2–3 timpi, tub care cade pe zăpadă;
  târnăcopul sună diferit în lemn / piatră / zăpadă / carne; bradul care cade, zăcământul spart,
  drujba; pescuit: aruncare, mușcătură, mulineta, smucitură, prins / scăpat.
- **Muzică pe stări** (`MusicTracks.ts`): meniu eroic; ziua calmă (harpă și flaut sau cutie muzicală
  și pian); noaptea cu tobe taiko și coarde care cresc cu pericolul; boss = piesă rapidă și grea
  (Regele Iernii: clopot, orgă, cor); valul fără sfârșit = cea mai rapidă. În asalt, pauza dintre
  boși păstrează muzica de boss.
- **Arme** (`items.ts`): țeava ruginită → pușcă de vânătoare / flintă cu alice (rar) →
  mitralieră din țevi / arbaletă de os (epic) → lancea de gheață (legendar, încetinește).
  Armele câștigate se păstrează toate (`player.weapons`); schimbi între ele din bara rapidă.
- **Beta fără abilități**: doar 2 butoane (construcție + tragere). Fiecare clasă are o pasivă
  (Healer: aură de vindecare; Sniper: critice + străpunge; Tank: armură, pușcă cu alice, repară ×3).
- **Tragere**: ochești tu (drag pe buton / mouse) sau automat (ții apăsat); gloanțele se opresc
  în case, copaci, pietre. Fiecare armă are încărcător și timp de reîncărcare (auto la 0).
  Mergi mai încet cât tragi.
- **Turnuri** (`CONFIG.tower`): construiești o arbaletă (50 lemn); upgrade de nivel 2 (45) și 3 (80,
  doar după deblocare din magazin/cufăr) sau transformare (păstrează nivelul):
  Arbaletă (o țintă; abilitate: săgeată grea prin 3 zombi), Rachete (damage mare; racheta mare
  se sparge în mini-rachete), Tun (explozie pe zonă, lent; ghiuleaua lasă foc), Tesla (fulger;
  laser prin toată linia), Gheață (pasiv -30% viteză și -30% viteză de atac în rază; nova care
  îngheață; înghețul nu se adună: un zombie dezghețat e imun 3 s, și la alt turn). Proiectilele
  zboară cu adevărat (`state.shells`) și lovesc la sosire. Damage: arbaletă 8, rachete 20, tun 13,
  Tesla 14, gheață 4. Efecte sobre: arbaleta = săgeată + „toc” de lemn; racheta = dâră de fum,
  cerc mic de zăpadă și șuierat; tunul = singurul cu praf + pată de jar 2 s și bubuit înfundat;
  Tesla = linie subțire alb-albastră și țiuit doar cât atinge; gheața = crusta pe zombi, un
  trosnet, iar nova face un inel de gheață pe toată raza. Animații de tragere: coarda arbaletei
  sare și se încarcă o săgeată nouă, rachetele dau recul + flacără și fum în spate, țeava tunului
  se retrage și turnul se zguduie, globul Tesla se umflă și scânteiază înainte de fulger,
  cristalul de gheață se rotește mai repede. Proiectilele pleacă din gura țevii. Turn sub 50% viață = fum; sub 25% = foc mic. Vânzarea unui turn noaptea dă jumătate.
  Turnurile au HP: zombii loviți de un turn îl atacă întâi (dacă e la < 12 m), apoi merg spre
  mină și sparg zidurile din drum. Turnurile se repară doar ziua. Nimeni nu trece prin ele.
  Construcțiile distruse se prăbușesc: scândurile se desprind, praful stă ~1 s, bara de viață
  rămâne la zero până cade. Turnurile au cu 40% mai puțină viață decât înainte.
- **Decor**: zăpadă călcată, gri-albăstruie, în jurul minei; neatinsă și luminoasă spre margini (unde e
  ceața); brazii au zăpadă doar pe crengile de sus.
- **Mina cade**: crapă, plasma pâlpâie și se stinge, capacul de fier se trântește; ecranul final
  apare după 3 s (sunet: plasma care se stinge, apoi un singur trosnet). Victorie: scârțâit de
  capac care se deschide, apoi liniște.
- **Ziduri = segmente** (2,6 m) care se lipesc cap la cap; pot fi mutate, rotite (45°), îmbunătățite
  (lemn 5 lemn / 250 HP → forjat 10 / 600 HP → metal 20 / 1200 HP, table nituite) sau transformate în **ușă** (eroii trec, zombii nu). Zidurile opresc și
  eroii. Demolarea dă înapoi 70% din lemn ziua, jumătate din asta noaptea. Zombii sparg zidul din drumul lor; eroii din
  apropiere îl repară automat (Tank ×3, plus bonusul din magazin).
- **Mine**: din magazin; le pui unde stai (M / 💣); explodează când trece un zombie.
- **Sloturi**: 3 turnuri + 8 ziduri; la fiecare 3 nopți +1 turn și +4 ziduri.
- **Zombi**: walker, runner (rapid, din noaptea 2), spitter (scuipă de la distanță, din noaptea 3),
  flyer (zboară peste ziduri, din noaptea 4), brute (din noaptea 4), boss la nopțile 5 și 10.
  Navighează cu flow field; un zombie blocat > 2 s poate trece prin obstacole.
- **Zori**: zombii rămași iau foc și mor încet (fără monede), inclusiv boss-ul.
- **Monede**: cad doar uneori (șansă pe tip de zombie) și dispar după 30 s (clipesc la final).
- Zombii: +22% HP pe noapte, 50 + 10/noapte (×dificultate); mina are 3000 HP. Zombii gem tot mai
  des și mai tare cu cât se apropie de tine și mârâie când atacă. Botul de test (stă lângă mină,
  fără ziduri) ajunge la noaptea ~4 pe Easy/Medium/Hard și ~2–3 pe Nightmare; doar cu turnuri
  cade în noaptea 3 pe Easy și în prima noapte pe Nightmare.
- Fiecare jucător în plus: +50% zombi și +25% HP la zombi.

### Progres, unelte noi, armuri, zombi și boși noi
- **Level up** (`CONFIG.skills`, `systems/progression.ts`): la fiecare nivel primești 1 punct și alegi
  (max 5 trepte): **Tăiat** (+12% viteză; ★3 +1 lemn pe lovitură; ★5 bradul cade de 2× mai repede),
  **Minerit** (+12%; ★3 +50% aur; ★5 +1 ulei / fier), **Pescuit** (+10% timp, smucituri −10%; ★3
  smucituri la jumătate; ★5 peștele +50% aur), **Tras** (+6% damage; ★3 reîncărcare −25%; ★5 15%
  critice ×2). Nivelul dă în continuare +10% damage și viață.
- **Deblocări cu nivelul** (`CONFIG.levelUnlocks`, `tower.tierAtHeroLevel`): nv.2 **pistol**, nv.4
  **pușcă** + turnuri nv.3, nv.5 **drujba** (ia locul târnăcopului în bară), nv.6 turnuri nv.4
  (elită: stâlpi cu steaguri, cristale), nv.7 **pușcă de asalt**, nv.8 turnuri nv.5 (legendare).
- **Drujba** (`CONFIG.chainsaw`): taie la 0,22 s (brazi, animale și zombi, 22 damage), merge cu
  **benzină** (un bidon = 25 s). **Zăcăminte de ulei** (negre, cu baltă de țiței; 25% din zăcăminte)
  dau ulei brut; pus pe **foc** (meniul focului sau din bară) iese benzină în 12 s. Focul se poate
  construi acum în ambele moduri. Argintul / aurul dau și **fier**.
- **Armuri** (`CONFIG.armor`): cască, piept, pantaloni, papuci, din **piele** (de la căprioare 2, urși 4,
  porci 1) sau **metal** (fier + puțină piele). Piele 3/6/4/2% din damage, metal 6/12/8/4%; setul
  complet de piele: frig −30%, +5% viteză; de metal: +10% armură (−5% viteză). Se văd pe erou.
- **Zombi noi** (`CONFIG.zombieAbilities`): **Urlătoarea** (noaptea 3+, înfurie zombii din 7 m:
  ×1,5 viteză 4 s), **Umflatul** (2+, explodează lângă țintă sau la moarte: gaz, 34 damage în 3 m,
  sparge și ziduri), **Săpătorul** (5+, merge pe sub zăpadă — nu poate fi lovit, trece pe sub
  ziduri — și țâșnește lângă țintă), **Șamanul** (6+, stă în spate și vindecă zombii cu 20%).
- **Boși** (toți lasă cufăr): **Matca** (campania, noaptea 3: păianjen cu ouă, naște câte 2 pui la
  6 s și 6 la moarte; max 120 zombi pe hartă), **Lich-ul** (noaptea 6), apoi în asalt: **Yeti-ul
  turbat** (se încordează 0,9 s, apoi se năpustește în linie dreaptă, sparge zidul / turnul și te
  aruncă), **Vrăjitoarea viscolului** (se teleportează, aruncă țurțuri, îngheață turnurile 4 s),
  **Colosul de gheață** (undă de șoc în 5 m, bolovani în turnuri, la jumătate de viață se înfurie)
  și **Regele Iernii**. Bara de sus arată numele boss-ului.
- **Atacul se vede**: zombiul stă lângă tine, își ridică brațele / bâta (citit din `attackTimer`),
  apoi izbește; pe erou apar trei zgârieturi, sânge, la cei mari o undă și camera tremură. Eroul
  lovit se smucește, i se înmoaie genunchii și se clatină.
- **Lupta se simte**: fiecare armă are reculul ei (`GUN_FEEL` în Renderer), flacără la gura țevii,
  tuburi de alamă care sar pe zăpadă; zombii se încordează, izbesc și îngheață o clipă la impact
  (brutele se aruncă mai departe); loviturile îi împing din direcția glonțului, iar la moarte
  cad pe spate, departe de trăgător, și ridică zăpadă.
- **Unelte mai fluide**: lovitura cu târnăcopul se întinde exact pe intervalul dintre lovituri
  (izbitură, ricoșeu, ridicare, încordare); bradul se leagănă amortizat, zăcământul tresare.

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
- [x] Mod Supraviețuire (foame, frig, foc, gătit, vânătoare, ferme, inventar), vreme, muniție limitată
- [x] Ziduri în 3 stări, cufăr de împușcat, 12 skin-uri, clasament, anunțuri Rampage, muzică de meniu
- [x] Grafică după referințele din Drive (eroi cu glugă și mantie, pietre cu gheață, copaci morți)
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
