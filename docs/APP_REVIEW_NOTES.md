# App Review notes

Paste the block below into App Store Connect review notes and the Play Console app-access instructions. Put the demo email and password in those consoles only.

## Paste this

Tuneable is a tip and chart app. Sign in with the demo account, open Music, and play a track from the chart. That chart defaults to Playable and streams rights-cleared audio: the rights holder uploaded it, or an approved claim is on file. Other listings are catalogue metadata. Playback stays off until the rights holder uploads audio or grants permission. Tips on those listings sit in escrow for the rights holder and are refunded if they ask us to remove the listing. Search can add a MusicBrainz match as metadata; it does not stream that recording. “Show catalog” lists those non-playable titles on purpose.

Demo account:
Email: FILL_IN_DEMO_EMAIL
Password: FILL_IN_DEMO_PASSWORD

After sign-in, stay on the Music chart. Play “I Took A Pill In Komiza” (Philip Ashford) and “Nasty” (Anna Reusch). Both should start. You do not need to tip, search the catalogue, or open “Show catalog” to review playback.

## Before you submit

- Use any account that can sign in with email and password. The two tracks above are on the global Music chart, not private to one user. Paste that login into App Store Connect and Play Console. Do not commit the password.
- Before a later submission, run `node scripts/auditPermittedHosted.js` from `tuneable-backend`. It lists permitted hosted tracks that have a real permission note, and tracks that do not. Re-run with `--execute` to set the uncertain rows back to pending. That stops playback. It does not delete the listing or refund tips.

## Permitted tracks kept

None. Audited 22 September 2026.

46 hosted tracks were marked permitted without a note that describes an off-platform grant (library-import “rights pending” stamps, or a placeholder note). They were set back to pending. Listings and tips were left in place. A second dry run reported 0 permitted hosted tracks, so the default chart is rights-cleared audio only.

Active cleared tracks on that chart: “I Took A Pill In Komiza” (Philip Ashford) and “Nasty” (Anna Reusch).
