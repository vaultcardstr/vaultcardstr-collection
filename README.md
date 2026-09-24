# FrenzyGoldies Card Collection

A GitHub Pages card-collection website with an optional Supabase backend.

## What this version adds

- Public collection/vitrine
- Search and category filters
- Card detail modal
- Admin login
- Add card from the website
- Upload card photo from the website
- Edit/delete cards
- Featured cards
- Supabase database + Storage
- Demo mode still works before Supabase is configured

## One-time Supabase setup

1. Create a Supabase Free project.
2. Open **SQL Editor** and run `supabase.sql` in this folder.
3. In **Authentication > Users**, create your private admin user.
4. Copy your Project URL and browser-safe Publishable/Anon key into `config.js`:

```js
window.FG_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_KEY: "YOUR-PUBLISHABLE-OR-ANON-KEY"
};
```

5. Upload the changed `config.js`, `index.html`, `app.js`, `cards.js`, `style.css` and `supabase.sql` to GitHub (the SQL file is only for setup and is not executed by the website).
6. Open the site and press **Admin Girişi**.
7. Log in with the Supabase user you created.
8. Open **Admin Panel > + Yeni Kart**.
9. Choose the card photo, fill the fields and press **Kaydet**.

## Security

Never put a Supabase `service_role` / secret key in `config.js`. Browser code should only use the public/publishable or anon key with RLS policies enabled.

## Image limit

The UI limits card photos to 6 MB. Supabase recommends standard uploads for smaller files; for larger files it recommends resumable uploads.
