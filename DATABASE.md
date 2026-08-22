# Database – BoligDialog

PostgreSQL via Supabase. Alle tabeller har Row Level Security aktivert.

---

## ER-Diagram

```mermaid
erDiagram
    users {
        uuid id PK
        text email
        text full_name
        enum role
        text avatar_url
        text push_token
        timestamptz created_at
    }

    properties {
        uuid id PK
        uuid landlord_id FK
        text address
        text city
        text postal_code
        text description
        timestamptz created_at
    }

    units {
        uuid id PK
        uuid property_id FK
        text unit_number
        int floor
        int size_sqm
        int monthly_rent
        uuid tenant_id FK
        date lease_start
        date lease_end
        timestamptz created_at
    }

    leases {
        uuid id PK
        uuid unit_id FK
        uuid tenant_id FK
        date started_at
        date ended_at
        timestamptz created_at
    }

    invitations {
        uuid id PK
        uuid unit_id FK
        uuid landlord_id FK
        text email
        text token
        enum status
        timestamptz expires_at
        timestamptz created_at
    }

    messages {
        uuid id PK
        uuid unit_id FK
        uuid sender_id FK
        text content
        text image_url
        timestamptz read_at
        timestamptz created_at
    }

    issues {
        uuid id PK
        uuid unit_id FK
        uuid tenant_id FK
        text title
        text description
        enum category
        enum status
        timestamptz resolved_at
        timestamptz created_at
        timestamptz updated_at
    }

    issue_images {
        uuid id PK
        uuid issue_id FK
        text storage_path
        timestamptz created_at
    }

    documents {
        uuid id PK
        uuid unit_id FK
        uuid uploaded_by FK
        text name
        enum category
        text storage_path
        int file_size
        timestamptz created_at
    }

    expenses {
        uuid id PK
        uuid unit_id FK
        uuid landlord_id FK
        int amount
        enum category
        text description
        date date
        timestamptz created_at
    }

    inspection_reports {
        uuid id PK
        uuid unit_id FK
        uuid landlord_id FK
        uuid lease_id FK
        enum type
        enum status
        text notes
        timestamptz tenant_signed_at
        uuid tenant_signed_by FK
        timestamptz locked_at
        timestamptz created_at
    }

    inspection_items {
        uuid id PK
        uuid report_id FK
        enum category
        enum condition
        text notes
        text tenant_comment
        timestamptz created_at
    }

    inspection_photos {
        uuid id PK
        uuid item_id FK
        text storage_path
        uuid uploaded_by FK
        timestamptz created_at
    }

    users ||--o{ properties : "eier (landlord_id)"
    properties ||--o{ units : "har (property_id)"
    units ||--o{ leases : "har (unit_id)"
    users ||--o{ leases : "leietaker (tenant_id)"
    units ||--o{ invitations : "har (unit_id)"
    users ||--o{ invitations : "utleier (landlord_id)"
    units ||--o{ messages : "tilhører (unit_id)"
    users ||--o{ messages : "sender (sender_id)"
    units ||--o{ issues : "har (unit_id)"
    users ||--o{ issues : "innmelder (tenant_id)"
    issues ||--o{ issue_images : "har (issue_id)"
    units ||--o{ documents : "har (unit_id)"
    users ||--o{ documents : "lastet opp (uploaded_by)"
    units ||--o{ expenses : "har (unit_id)"
    users ||--o{ expenses : "utleier (landlord_id)"
    units ||--o{ inspection_reports : "har (unit_id)"
    users ||--o{ inspection_reports : "utleier (landlord_id)"
    leases ||--o{ inspection_reports : "knyttet til (lease_id)"
    users ||--o{ inspection_reports : "signert av (tenant_signed_by)"
    inspection_reports ||--o{ inspection_items : "har (report_id)"
    inspection_items ||--o{ inspection_photos : "har (item_id)"
    users ||--o{ inspection_photos : "lastet opp (uploaded_by)"
```

---

## Tabeller

### `users`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | Supabase Auth UID |
| `email` | text | E-postadresse |
| `full_name` | text | Fullt navn |
| `role` | enum | `landlord` eller `tenant` |
| `avatar_url` | text? | Profilbilde-URL |
| `push_token` | text? | Expo push-token |
| `created_at` | timestamptz | |

---

### `properties`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `landlord_id` | uuid FK → users | Eier |
| `address` | text | Gateadresse |
| `city` | text | By |
| `postal_code` | text | Postnummer |
| `description` | text? | Valgfri beskrivelse |
| `created_at` | timestamptz | |

---

### `units`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `property_id` | uuid FK → properties | |
| `unit_number` | text | Enhetsnummer (f.eks. "1A") |
| `floor` | int? | Etasje |
| `size_sqm` | int? | Størrelse i m² |
| `monthly_rent` | int? | Månedlig leie (kr) |
| `tenant_id` | uuid FK → users? | Aktiv leietaker (cache) |
| `lease_start` | date? | |
| `lease_end` | date? | |
| `created_at` | timestamptz | |

> `tenant_id` er en cache for raskt oppslag. `leases`-tabellen er sannhetskilden.

---

### `leases`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | |
| `tenant_id` | uuid FK → users | |
| `started_at` | date | Innflyttingsdato |
| `ended_at` | date? | Utflyttingsdato — NULL = aktivt leieforhold |
| `created_at` | timestamptz | |

**Bruk:** Opprettes automatisk når leietaker aksepterer invitasjon. `ended_at` settes når utleier avslutter leieforholdet. Gir full historikk over alle leietakere per enhet.

---

### `invitations`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | |
| `landlord_id` | uuid FK → users | |
| `email` | text | E-post til invitert leietaker |
| `token` | text | Unik token for invitasjonslenke |
| `status` | enum | `pending`, `accepted`, `expired` |
| `expires_at` | timestamptz | |
| `created_at` | timestamptz | |

---

### `issues`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | |
| `tenant_id` | uuid FK → users | Innmelder |
| `title` | text | |
| `description` | text | |
| `category` | enum | `plumbing`, `electrical`, `windows_doors`, `other` |
| `status` | enum | `open`, `in_progress`, `resolved` |
| `resolved_at` | timestamptz? | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `issue_images`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `issue_id` | uuid FK → issues | |
| `storage_path` | text | Sti i Supabase Storage |
| `created_at` | timestamptz | |

---

### `messages`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | Hvilken enhet samtalen gjelder |
| `sender_id` | uuid FK → users | |
| `content` | text | |
| `image_url` | text? | Bildevedlegg |
| `read_at` | timestamptz? | NULL = ulest |
| `created_at` | timestamptz | |

---

### `documents`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | |
| `uploaded_by` | uuid FK → users | |
| `name` | text | Filnavn |
| `category` | enum | `contract`, `rules`, `receipt`, `other` |
| `storage_path` | text | |
| `file_size` | int | Bytes |
| `created_at` | timestamptz | |

---

### `expenses`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | |
| `landlord_id` | uuid FK → users | |
| `amount` | int | Beløp (kr) |
| `category` | enum | `maintenance`, `repair`, `utilities`, `insurance`, `tax`, `other` |
| `description` | text | |
| `date` | date | |
| `created_at` | timestamptz | |

---

### `inspection_reports`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK → units | |
| `landlord_id` | uuid FK → users | |
| `lease_id` | uuid FK → leases? | Knytter rapporten til ett bestemt leieforhold |
| `type` | enum | `move_in` eller `move_out` |
| `status` | enum | `draft` → `sent_to_tenant` → `tenant_responded` → `locked` |
| `notes` | text? | Generell merknad |
| `tenant_signed_at` | timestamptz? | |
| `tenant_signed_by` | uuid FK → users? | |
| `locked_at` | timestamptz? | |
| `created_at` | timestamptz | |

---

### `inspection_items`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `report_id` | uuid FK → inspection_reports | |
| `category` | enum | `kitchen`, `bathroom`, `floors`, `walls`, `other` |
| `condition` | enum? | `good`, `fair`, `poor` |
| `notes` | text? | Utleiers notat |
| `tenant_comment` | text? | Leietakers kommentar |
| `created_at` | timestamptz | |

---

### `inspection_photos`
| Kolonne | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `item_id` | uuid FK → inspection_items | |
| `storage_path` | text | |
| `uploaded_by` | uuid FK → users? | Skiller utleiers og leietakers bilder |
| `created_at` | timestamptz | |

---

## Statusflyt — inspeksjonsrapport

```
draft ──► sent_to_tenant ──► tenant_responded ──► locked
  │              │                   │                │
  │         Leietaker           Utleier          Ingen kan
  │         kommenterer         låser            endre
  │         og signerer         rapporten
  │
Utleier fyller ut
rom og bilder
```

## Leiesyklus

```
invitations (pending)
      │  Leietaker aksepterer
      ▼
leases (ended_at = NULL)  ←──── aktiv
units.tenant_id = user.id
      │
      │  Utleier avslutter
      ▼
leases (ended_at = dato)  ←──── historikk
units.tenant_id = NULL
```

## Relasjoner

```
users (1) ──< properties (1) ──< units (1) ──< leases
                                          (1) ──< invitations
                                          (1) ──< messages
                                          (1) ──< issues (1) ──< issue_images
                                          (1) ──< documents
                                          (1) ──< expenses
                                          (1) ──< inspection_reports (1) ──< inspection_items (1) ──< inspection_photos
```
