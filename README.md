# BoligDialog

Norsk mobil-app som samler all kommunikasjon mellom utleier og leietaker på ett sted — meldinger, feilmeldinger, dokumenter, rapporter og leiehistorikk.

---

## Kom i gang

### Forutsetninger

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Supabase-prosjekt (se [supabase.com](https://supabase.com))
- iOS Simulator / Android Emulator, eller Expo Go på fysisk enhet

### Installasjon

```bash
git clone <repo-url>
cd boligdialog
npm install
```

### Miljøvariabler

Opprett en `.env`-fil i rotkatalogen:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<ditt-prosjekt>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<din-anon-nøkkel>
```

### Database

Kjør migrasjonen i Supabase SQL Editor:

```bash
# Lim inn innholdet i supabase/migrations.sql
```

### Start appen

```bash
npx expo start
```

---

## Funksjoner

### Utleier
| Funksjon | Skjerm | Beskrivelse |
|---|---|---|
| Dashboard | `(landlord)/index` | Stat-kort (åpne feil, behandles, leietakere) + snarveier |
| Eiendommer | `(landlord)/properties` | Liste over alle eiendommer |
| Eiendomsdetaljer | `(landlord)/property/[id]` | Enheter, leietakere, dokumenter, utgifter, rapporter |
| Leiehistorikk | `property/[id]` (modal) | Alle tidligere og aktive leietakere per enhet med periode og varighet |
| Avslutt leieforhold | `property/[id]` (modal) | Setter ended_at på lease og fjerner leietaker fra enhet |
| Feilmeldinger | `(landlord)/issues` | Alle feil på tvers av eiendommer med statusfilter |
| Meldinger | `(landlord)/messages` | Chat per enhet med ulest-badge og sanntidsoppdatering |
| Rapporter | `(landlord)/inspection` | Opprett inn-/utflyttingsrapporter med bilder per rom |
| Dokumenter | `property/[id]` (modal) | Last opp kontrakter, husregler og kvitteringer per enhet |
| Utgifter | `property/[id]` (modal) | Registrer og spor utgifter per enhet |
| Fellesvarsler | `property/[id]` | Send kunngjøring til alle leietakere i en eiendom |
| Profil | `(landlord)/profile` | Brukerinfo og utlogging |

### Leietaker
| Funksjon | Skjerm | Beskrivelse |
|---|---|---|
| Hjem | `(tenant)/index` | Varsler, leieforhold-info, snarvei til feilmelding og meldinger |
| Feilmeldinger | `(tenant)/issues` | Rapporter feil med bilde og følg status |
| Meldinger | `(tenant)/messages` | Chat direkte med utleier |
| Dokumenter | `(tenant)/documents` | Se og last ned dokumenter delt av utleier |
| Rapporter | `(tenant)/inspections` | Gjennomgå, kommenter, last opp bilder og signer rapporter |
| Profil | `(tenant)/profile` | Brukerinfo og utlogging |

---

## Teknologi

| Lag | Teknologi |
|---|---|
| Frontend | React Native + Expo SDK 56 |
| Routing | Expo Router v3 (filbasert) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| Sanntid | Supabase Realtime (Postgres Changes) |
| Tilstand | Zustand |
| Ikoner | @expo/vector-icons (Ionicons) |
| Autentisering | Supabase Auth med SecureStore |

---

## Prosjektstruktur

```
boligdialog/
├── app/
│   ├── _layout.tsx              # Root layout — auth-guard, splash, routing
│   ├── (auth)/                  # Login, registrering, glemt passord
│   ├── invite/[token].tsx       # Invitasjonsaksept — oppretter lease
│   ├── (landlord)/
│   │   ├── _layout.tsx          # Tab-navigator (5 tabs) + unread-badge
│   │   ├── index.tsx            # Dashboard
│   │   ├── properties.tsx       # Eiendomsliste
│   │   ├── property/[id].tsx    # Enhet, leietaker, historikk, docs, utgifter
│   │   ├── issues.tsx           # Feilmeldinger
│   │   ├── messages.tsx         # Meldinger
│   │   ├── inspection.tsx       # Inn-/utflyttingsrapporter
│   │   └── profile.tsx          # Profil
│   └── (tenant)/
│       ├── _layout.tsx          # Tab-navigator (6 tabs)
│       ├── index.tsx            # Hjem
│       ├── issues.tsx           # Feilmeldinger
│       ├── messages.tsx         # Meldinger
│       ├── documents.tsx        # Dokumenter
│       ├── inspections.tsx      # Rapporter
│       └── profile.tsx          # Profil
├── components/
│   ├── Icon.tsx                 # Gjenbrukbare ikonkomponenter
│   └── ProfileScreen.tsx        # Delt profilskjerm
├── lib/
│   ├── supabase.ts              # Supabase-klient med SecureStore-adapter
│   └── types.ts                 # TypeScript-typer + Database-interface
├── stores/
│   └── authStore.ts             # Zustand: session, user, loading, signOut
├── assets/                      # Bilder og ikoner
├── supabase/
│   └── migrations.sql           # Database-migrasjoner
└── landing/
    └── index.html               # Landingsside
```

---

## Miljø

Appen krever to miljøvariabler via `EXPO_PUBLIC_`-prefiks. Sensitiv konfigurasjon (service role key) skal **aldri** legges i klientkoden.

---

## Lisens

Privat prosjekt — alle rettigheter forbeholdt.
