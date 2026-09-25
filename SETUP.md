# The Revolution Store — Firebase repair package

This package is based directly on the supplied project. The existing HTML/CSS design is preserved.

## What was repaired

- Storefront product loading no longer requires a Firestore composite index.
- Admin and Storage rules recognize the existing Firebase admin email and still support `admins/{uid}.admin == true`.
- Product image uploads use Firebase's resumable upload API and show upload progress in the existing admin form.
- The old service-worker cache is removed from the active project. The HTML entry points also unregister an old registration once and reload before starting the app.
- A bucket CORS configuration is included for the existing VS Code Live Server origins.

## Firebase requirements

1. Firebase Authentication → Email/Password must be enabled.
2. The admin Firebase Auth account must use the admin email already present in `admin.js` and the rules: `akasean715@gmail.com`.
3. Firestore and Storage must be enabled.
4. Publish `firestore.rules` and `storage.rules`.
5. Apply `cors.json` to the Cloud Storage bucket before browser image uploads from localhost.

## Apply CORS

Install/use Google Cloud CLI, then from this project folder run:

```powershell
gcloud storage buckets update gs://the-revolution-mma-store.firebasestorage.app --cors-file=cors.json
```

There is also `apply-cors.ps1` and `apply-cors.bat`.

## Local use

Use VS Code Live Server as before. Open `admin.html`, sign in, and add a product. The image uploads to Firebase Storage and the product document is created in Firestore. The storefront reads the same `products` collection and automatically displays active products.

## MEGA server

The supplied MEGA server is retained separately and is not used for the live product image path in this repair. The reason is that a MEGA share link is not itself a normal image URL for CSS/background rendering; using MEGA as the live image host would require a server-side image proxy. The current storefront can therefore remain a static Firebase-backed site without adding another runtime dependency.

Keep `server/.env` private. It contains MEGA credentials and must never be committed or publicly uploaded.
