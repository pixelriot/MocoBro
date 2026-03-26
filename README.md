# MocoBro

MocoBro is a small Angular app that helps you backfill MOCO worklogs faster.

It compares your MOCO presences and activities for the selected month, highlights days with presence but missing activity, and lets you submit bulk activity entries for those days.

## What It Does

- Login with your personal MOCO API key
- Load your profile, assigned projects, tasks, presences, and existing activities
- Show a month overview with visual day states
- Calculate and display:
	- presence days
	- activity days
	- "lazy" days (presence without activity)
- Create bulk activities for missing days using selected project/task and description

## Tech Stack

- Angular 19 (standalone components)
- Tailwind CSS v4

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server

```bash
npm start
```

Default URL is usually `http://localhost:4200`.

### 3. Enter your MOCO API key

In the app, paste your personal API key from MOCO:

## Available Scripts

- `npm start` - start dev server
- `npm run build` - create production build in `dist/moco-bro`
- `npm run watch` - development build in watch mode
- `npm test` - run unit tests (Karma)

## Security Notes

- The API key is currently stored in browser `localStorage` for convenience.
- Do not use this app in an untrusted browser profile or shared machine account.
