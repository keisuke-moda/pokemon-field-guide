# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Japanese-language Pokédex web app. The Go backend proxies PokéAPI so the frontend never calls it directly.

## Commands

### Frontend (`frontend/`)
```bash
npm run dev       # dev server (http://localhost:3000)
npm run build     # production build
npm run preview   # preview production build
```

### Backend (`backend/`)
```bash
go run .          # start API proxy on :8080
go build .        # compile binary
```

Both services must be running for the app to work.

## Architecture

### Backend (`backend/greeting.go`)
A thin Echo HTTP proxy. Every route under `/api` forwards the request to `https://pokeapi.co/api/v2` and streams the response back. No data transformation, caching, or storage — pure passthrough.

**CORS caveat:** The backend only allows origins `localhost:3000–3002`. If Nuxt auto-selects a higher port (e.g. 3003), API calls will fail with CORS errors. Add the port to `AllowOrigins` in `greeting.go`.

### Frontend (`frontend/`)
Nuxt 4 + Vue 3. `runtimeConfig.public.apiBase` (set in `nuxt.config.ts`) points to `http://localhost:8080/api`.

**Key files:**
- `app/app.vue` — root shell, just `<NuxtPage />`
- `app/pages/index.vue` — Pokémon list with generation filter, bilingual search (EN/JA), and pagination
- `app/pages/pokemon/[id].vue` — detail page: base stats, moves (tabbed by learn method), abilities with modal, and an IV/EV stat calculator
- `app/composables/usePokemon.ts` — single file that exports *both* the `usePokemon()` composable (API fetch wrappers) *and* all shared constants/utilities (type colors, stat names, nature data, IV/EV formulas, helpers)

### Data flow
1. `usePokemon()` composable provides `fetchPokemon`, `fetchPokemonSpecies`, `fetchAbility`, `fetchMove`
2. Pages call these via `useAsyncData` (SSR-safe); moves are lazy-loaded per tab in chunks of 25
3. The Japanese name index on the list page is built client-side in background chunks of 50 species requests

### Localization
All UI text is Japanese. Type names, stat names, nature names, and move learn methods are translated via lookup tables in `usePokemon.ts`. Japanese names for Pokémon, abilities, and moves come from the PokéAPI `names` array filtered to `language.name === 'ja'` (with `'ja-Hrkt'` as fallback).

### Stat calculator
Uses the official Gen 5+ formulas:
- HP: `floor((2×base + iv + floor(ev/4)) × level / 100) + level + 10`
- Other: `floor((floor((2×base + iv + floor(ev/4)) × level / 100) + 5) × nature)`

EV input is clamped to 252 per stat and 510 total.
