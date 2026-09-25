# Run this script from PowerShell after installing Google Cloud CLI.
# It applies the browser CORS policy to the Firebase Storage bucket.
$bucket = "gs://the-revolution-mma-store.firebasestorage.app"
gcloud storage buckets update $bucket --cors-file=cors.json
