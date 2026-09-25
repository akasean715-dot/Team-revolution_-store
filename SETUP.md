# The Revolution Store — clean Firebase package

This package keeps the existing store/admin HTML and CSS design and wires it to the Firebase project configured in `firebase.js`.

## Firebase requirements

1. Enable Authentication → Email/Password.
2. Create the admin user with the email you intend to use.
3. In Firestore create `admins/{ADMIN_USER_UID}` with:
   - `admin: true`
4. Make sure Firestore and Storage are enabled.
5. Publish the included `firestore.rules` and `storage.rules`.

## Local testing

Run the folder through a local web server (for example VS Code Live Server). Do not open the HTML directly as `file://`.

The package intentionally has no service worker. On localhost, the JS also unregisters an old service worker from earlier versions so stale Firebase requests do not remain active.

## Product flow

Admin → Add Product → image uploads to Firebase Storage → product document is created in Firestore → storefront reads active products from Firestore automatically.

The storefront reads the same `imageUrl` field created by the admin page.
