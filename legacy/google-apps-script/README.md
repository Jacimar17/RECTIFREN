# Legacy Google Apps Script backend

`Code.gs` is the historical Google Apps Script + Google Sheets API. It is not used by the current application:

- The frontend in `js/` calls the Node API at `https://rectifren-api.onrender.com`.
- `render.yaml` deploys `backend/api` and configures MongoDB; it does not deploy this directory.
- No active frontend, backend route, environment configuration, or project documentation references this script.

The file is retained unchanged for historical/reference purposes and is not part of the active deployment. Running it requires the Google Apps Script runtime and its built-in `SpreadsheetApp`, `CacheService`, `PropertiesService`, and `ContentService` services. The older authentication flow reads `ADMIN_USER` and `ADMIN_PASS` from Apps Script Script Properties.
