# Apna Sajra feature inventory

Yeh inventory current workspace ke source code aur recent Git history ko dekh kar banayi gayi hai. Iska maqsad future changes se pehle current product ka scope yaad rakhna hai, taaki purane version ke hisaab se kaam na ho.

**Source checked:** `main` at `0787cea` (20 Nov 2026). Yeh code inventory hai; har feature ka live production behavior alag se end-to-end test nahi kiya gaya.

## Family archive

- Home page with featured-member slider, swipe navigation on touch screens, dots, profession, member bio and profile links.
- Family member profiles with stable unique IDs, Urdu/English names, profession, photo, bio, birth/death details, birthplace, parents, spouses and family relationships.
- Interactive family tree, member search/navigation, branches, roots and family-by-generation book view.
- Member profile books/publications, including cover image and downloadable PDF when supplied.
- Family photo gallery and profiles with sharing/print actions.
- CSV member import and JSON backup export/import in the admin console.

## Visitor and family features

- Public announcements/notice board and family calendar, including birthdays and remembrance events.
- Dua/prayer requests.
- Per-profile guestbook for memories and wishes.
- Public profile correction suggestions and secure self-profile update links. Submitted profile changes wait for review before being applied.
- Donations for five configurable causes: sick member, masjid, madarsa, iftari and sehri. Visitors can submit a claimed payment using configured UPI/QR details; an admin/editor confirms it. Sajra records donations and does not process or independently verify UPI payments.
- Live-stream page for the current family stream.
- Homepage banner to download the Android app.

## Chat, language and presentation

- “Anis Ai” family-tree chatbot, with chat feedback, suggested questions, voice input where the device supports it, and Urdu interface/reply-language support.
- English and Urdu UI, RTL layout, Urdu digits, and Urdu translations for the live visitor map and major app flows.
- Light and dark themes.
- Responsive web/mobile layout; Capacitor Android app support; Lenis page scrolling.
- First-launch Android onboarding video with Skip/Next, sound toggle, a short feature summary, and a saved completion marker so it does not replay after app updates.

## Admin and editor console

- Dashboard, member management, user management, gallery, suggestions, profile-update review, log history, data-quality checks, backup, analytics and settings.
- Create/manage staff accounts through Supabase Auth-backed admin function; admin controls role and per-editor permissions.
- Granular editor capabilities represented in `UserPermissions`: add/edit members, add gallery photos, select homepage slider members, post announcements, manage live stream, review profile updates, manage donations, and manage analytics. Menus are filtered by granted permissions.
- Admin security settings include password change and multi-factor authentication controls; biometric/device lock is available in the supported Android flow.
- Pending profile updates, donations and other relevant items can surface navigation badges.
- Admin announcement and live-stream publishing can send phone push notifications when the required Firebase/Supabase configuration is present.

## Analytics and native-app services

- GA4 web/native analytics and an admin live-visitors map showing approximate recognized city-level activity; it does not provide exact device locations.
- Android app settings include update checking and notification preferences. Android APK publishing is a manual GitHub Actions workflow; a new APK is not implied by website deployment.
- Firebase push notification integrations cover announcements, family events and release/update notices when configured.

## Server-side functions and data protection

Supabase Edge Functions currently present in this workspace:

- `admin-users` — staff account administration.
- `profile-updates` — secure token-based profile update flow and review submissions.
- `sajra-chat` — chatbot backend.
- `ga4-realtime` — Analytics API data for the live map.
- `send-admin-alert` — alerts to admins for supported visitor submissions.
- `send-announcement`, `send-daily-events`, `send-live` — push notifications for announcements, family events and live-stream updates.

Migrations currently present:

- `20261105090000_secure_profile_updates.sql` — secure profile-update/public submission policies.
- `20261118090000_donations.sql` — donation data support.

## Recent additions and fixes in Git history

- Nov 16: mobile slider dots/swipe, chatbot Urdu/localization fixes, Urdu sizing/RTL/digits, and live-map translation.
- Nov 17: homepage Android-app download banner.
- Nov 18: five-cause donations, public submission error handling, admin alerts for donation/profile-update submissions, and universal navigation adjustments.
- Nov 19: more consistent web/APK admin navigation labels and logged-in staff name/photo in the menu.
- Nov 20: fix for custom “Other” profession on profile-update links and a dedicated editor permission for Analytics, including the live map.

## Source-of-truth pointers

- Main application and routes: `src/App.tsx`
- Data types and permissions: `src/types.ts`
- Tree, archive and data helpers: `src/lib.ts`
- English/Urdu strings: `src/i18n.ts`
- Supabase integration: `src/supabase.ts`, `supabase/functions/`, `supabase/migrations/`
- Android configuration and app plugins: `android/`, `capacitor.config.ts`
- Website deployment workflow: `.github/workflows/deploy.yml`
- Manual Android APK workflow: `.github/workflows/android-apk.yml`

When starting a future task, check this inventory and the current source/branch first. Update this file when a feature is added, removed, or its permissions/behavior materially changes.
