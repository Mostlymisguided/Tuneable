# Founding Creators

First **1,111** creators who complete a **verified original upload** claim a founding seat.

## Perks

- Founding status / seat number (not equity or ownership)
- Upload allowance (default **2048 MB**, env `FOUNDING_UPLOAD_QUOTA_MB`)
- Exclusive **3%** artist-invite commission for 12 months (from Tuneable’s platform share)

Ordinary invites still work for growth; only founding inviters earn commission.

## Tunables (backend env)

| Variable | Default | Meaning |
|----------|---------|---------|
| `FOUNDING_CREATOR_CAP` | `1111` | Max founding seats |
| `FOUNDING_UPLOAD_QUOTA_MB` | `2048` | Per-founding-creator original-upload allowance |

## Seat assignment

- Trigger: first qualifying Self-upload / `upload` source on `POST /api/media/upload` (and attach-upload when cleared as original)
- Atomic counter: `FoundingProgram` singleton (`claimedSeats`)
- User fields: `isFoundingCreator`, `foundingSeatNumber`, `foundingSeatAssignedAt`, `foundingUploadQuotaBytes`

## APIs

- `GET /api/users/founding-creators` — public counter
- `GET /api/users/me/founding-creator` — seat + usage
- `POST /api/users/admin/backfill-founding-creators` — assign seats to earliest existing original uploaders (admin)

## Backfill

After deploy, run as admin:

```bash
curl -X POST "$API/users/admin/backfill-founding-creators" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

Or from Node: `require('./utils/foundingCreators').backfillFoundingSeats()`.

## Legal copy

Terms §4.4 Founding Creators and §4.5 Artist Invite Commission (Founding Creators).
