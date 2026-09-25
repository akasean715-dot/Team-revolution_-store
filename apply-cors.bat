@echo off
set BUCKET=gs://the-revolution-mma-store.firebasestorage.app
gcloud storage buckets update %BUCKET% --cors-file=cors.json
pause
