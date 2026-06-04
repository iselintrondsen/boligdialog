# Arkitektur – BoligDialog

## Overordnet struktur

```
┌─────────────────────────────────────────────┐
│              React Native App               │
│         (Expo SDK 56 / Expo Router)         │
├───────────────────┬─────────────────────────┤
│   UI / Skjermer   │     Tilstand (Zustand)  │
├───────────────────┴─────────────────────────┤
│             Supabase JS Client              │
├──────────┬──────────────┬───────────────────┤
│   Auth   │  PostgreSQL  │     Storage       │
│          │  + Realtime  │   (bilder/docs)   │
└──────────┴──────────────┴───────────────────┘
```

---

## Routing

Appen bruker Expo Router v3 med filbasert routing og tre route-grupper:

```
(auth)      →  Ikke innlogget
(landlord)  →  Innlogget som utleier
(tenant)    →  Innlogget som leietaker
```

Rotlayouten (`app/_layout.tsx`) lytter på `supabase.auth.onAuthStateChange` og videresender brukeren til riktig gruppe basert på `user.role`. Splash-skjerm vises mens `loading === true`.

```
App starter
    │
    ▼
getSession()
    │
    ├── Ingen session ──────────────────► /(auth)/login
    │
    └── Session + user.role
            ├── 'landlord' ─────────────► /(landlord)/
            └── 'tenant'   ─────────────► /(tenant)/
```

### Tab-navigatorer

**Utleier (5 tabs):**
Hjem · Eiendommer · Feilmelding · Meldinger · Profil

`_layout.tsx` henter antall uleste meldinger ved mount og abonnerer på Realtime for å holde badge oppdatert.

**Leietaker (6 tabs):**
Hjem · Feil · Meldinger · Dokumenter · Rapporter · Profil

---

## Autentisering

- Supabase Auth håndterer innlogging, registrering og tokenfornyelse
- Tokens lagres kryptert med **expo-secure-store**
- Brukerprofil hentes fra `public.users` etter innlogging
- Global tilstand i **Zustand** (`authStore`): `session`, `user`, `loading`

---

## Leiesyklus

En leietaker kobles til en enhet via en invitasjon:

```
1. Utleier oppretter invitasjon (token) for en enhet
2. Leietaker åpner invitasjonslenken (invite/[token].tsx)
3. Aksept → oppretter en lease-rad med started_at = i dag
            → setter units.tenant_id = user.id
4. Leietaker får tilgang til enhetens data

Utflytting:
5. Utleier avslutter leieforholdet (ended_at = i dag)
   → units.tenant_id settes til NULL
   → Leietaker mister tilgang
   → Historikk (rapporter, meldinger) beholdes
6. Ny leietaker kan inviteres → ny lease opprettes
```

Leiehistorikk per enhet er alltid tilgjengelig for utleier via historikk-modal i `property/[id].tsx`.

---

## Inspeksjonsrapport – statusflyt

```
draft
  │  Utleier fyller ut rom, setter tilstand og laster opp bilder
  ▼
sent_to_tenant
  │  Leietaker ser rapporten, kommenterer og laster opp egne bilder
  ▼
tenant_responded
  │  Utleier gjennomgår og låser rapporten
  ▼
locked  ← kan ikke endres av noen
```

**Rollekontroll:**
- Leietaker kan kun redigere når status er `sent_to_tenant`
- Utleier kan kun låse når status er `tenant_responded`
- Leietakers bilder skilles fra utleiers via `inspection_photos.uploaded_by`

---

## Dataflyt

### Les data
Skjermene kaller Supabase direkte ved mount via `useEffect`. Row Level Security i databasen sørger for at brukere kun ser egne data — ingen egen autorisasjonslag trengs i appen.

### Sanntid
Meldinger og utleiers unread-badge abonnerer på Postgres Changes:

```typescript
const channel = supabase.channel('chat')
  .on('postgres_changes',
    { event: 'INSERT', table: 'messages', filter: `unit_id=eq.${id}` },
    (payload) => setMessages(prev => [...prev, payload.new]))
  .subscribe();

return () => supabase.removeChannel(channel);
```

### Fillagring
Bilder og dokumenter lastes opp til Supabase Storage (`documents`-bucket). Filstien lagres i databasen. Signerte URL-er (60 sek) genereres ved visning.

---

## Komponentstruktur

```
app/
├── _layout.tsx            Auth-guard + splash + root Stack
├── invite/[token].tsx     Invitasjonsaksept + lease-oppretting
├── (auth)/
│   └── _layout.tsx        Stack uten header
├── (landlord)/
│   └── _layout.tsx        Tab (5) + unread-badge via Realtime
└── (tenant)/
    └── _layout.tsx        Tab (6)

components/
├── Icon.tsx               Wrapper-komponenter for Ionicons
└── ProfileScreen.tsx      Delt profilskjerm for begge roller

stores/
└── authStore.ts           Zustand: session, user, loading, signOut

lib/
├── supabase.ts            Supabase-klient med SecureStore-adapter
└── types.ts               Database-interface + alle domenetyper
```

---

## Tilstandsstyring

Kun **én global store** (Zustand) for autentisering. All annen tilstand er lokal (`useState`) per skjerm.

| Data | Hvor |
|---|---|
| Innlogget bruker / session | `authStore` (global) |
| Meldinger, feilmeldinger, rapporter | Lokal `useState` per skjerm |
| Uleste meldinger (badge) | Lokal `useState` i landlord `_layout.tsx` |
| Leases / historikk | Lokal `useState` i `property/[id].tsx` |

---

## Supabase Storage

Bucket: `documents`

| Sti | Innhold |
|---|---|
| `{user_id}/{unit_id}/{timestamp}_{filnavn}` | Dokumenter delt av utleier |
| `issues/{issue_id}/{filnavn}` | Bilder fra feilmeldinger |
| `inspections/{report_id}/{item_id}_{filnavn}` | Bilder fra rapporter |

---

## Database – kort oppsummert

```
users (1) ──< properties (1) ──< units (1) ──< leases
                                          (1) ──< invitations
                                          (1) ──< messages
                                          (1) ──< issues (1) ──< issue_images
                                          (1) ──< documents
                                          (1) ──< expenses
                                          (1) ──< inspection_reports (1) ──< inspection_items (1) ──< inspection_photos
```

Se `DATABASE.md` for fullstendig diagram og kolonnedokumentasjon.
