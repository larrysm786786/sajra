# Sajra

Sajra is now a static React family-tree app that can run on GitHub Pages.

## What changed

- The app is rebuilt in React + TypeScript + Vite.
- Data is stored locally in the browser.
- Members, users, gallery items, and backups are editable from the admin console.
- You can export and import the full app state as JSON.

## Local setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

1. Push the project to a GitHub repository named `sajra` or update `vite.config.ts` if the repo name is different.
2. In GitHub, go to `Settings > Pages`.
3. Set the source to GitHub Actions.
4. Push to `main` and the workflow in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) will publish the site.

## Data storage

- The app keeps its state in browser storage.
- Use the admin console to export a JSON backup before clearing data.
- Import that backup later to restore the site.

## Important files

- [`src/App.tsx`](./src/App.tsx) contains the full React app.
- [`src/lib.ts`](./src/lib.ts) contains storage, tree, and auth helpers.
- [`src/styles.css`](./src/styles.css) contains the UI styling.
