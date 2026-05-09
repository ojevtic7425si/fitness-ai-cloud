# Fitness AI v2.6 — PWA + shared backend sync

Ova verzija je spremna za korišćenje kao PWA i za isti skup podataka na telefonu i računaru.

## Šta je novo

- PWA manifest + service worker: možeš je instalirati na desktop/telefon.
- Dinamički API URL: lokalno koristi `http://localhost:3001/api`, a u produkciji može `/api` ili `VITE_API_URL`.
- Privatni `SYNC_KEY`: nema login-a, ali telefon i računar koriste isti tajni ključ.
- Backend i dalje koristi SQLite lokalno, ali sada može da radi kao **shared backend**: ako ga hostuješ na serveru sa trajnim diskom, svi uređaji čitaju istu bazu.

## Lokalno pokretanje

```cmd
npm run install:all
npm run dev:server
```

U drugom terminalu:

```cmd
npm run dev:client
```

Otvori: `http://localhost:5173`

## Sync key bez naloga

U `server/.env` možeš da postaviš:

```env
SYNC_KEY=neki-dugacak-tajni-kljuc
```

Onda u aplikaciji idi na **Profil → PWA / Sync bez naloga**, upiši isti ključ i klikni **Sačuvaj sync key**.

Ako backend ima `SYNC_KEY`, svaki uređaj mora slati isti ključ. Ovo zamenjuje login za tvoju privatnu aplikaciju.

## Povezivanje drugog uređaja

1. Na računaru unesi sync key u Profil tabu.
2. Klikni **Kopiraj link za uređaj**.
3. Otvori taj link na iPhone-u.
4. Safari → Share → **Add to Home Screen**.

Ako aplikacija koristi online backend, promene sa telefona i računara idu u istu bazu.

## Bitno za pravi multi-device

Za isti podatak na više uređaja mora postojati jedan backend koji oba uređaja koriste.

Opcije:

1. **Najlakše za test:** računar je backend na istoj Wi-Fi mreži.
2. **Bolje:** deploy backend na VPS/Railway/Render sa trajnim diskom/volume-om.
3. **Najbolje kasnije:** prebacivanje baze na cloud PostgreSQL/Supabase.

Ova verzija je pripremljena za opciju 1 i 2. Opcija 3 je sledeći korak ako želiš pravi cloud sync sa PostgreSQL bazom.

## Produkcija / PWA API URL

Ako frontend i backend nisu na istom domenu, napravi `client/.env`:

```env
VITE_API_URL=https://tvoj-backend.example.com/api
```

Zatim build:

```cmd
npm run build:client
```

## Napomena o slikama

Slike se i dalje čuvaju u `server/uploads`. Ako deploy-uješ backend, taj folder mora biti na trajnom disku/volume-u, inače slike mogu nestati posle redeploy-a.
