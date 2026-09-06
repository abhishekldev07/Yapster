# Yapster

**Communities worth talking about.**

Yapster is a community-first social platform for discovering interest-based spaces, sharing posts, joining threaded discussions, and connecting with other members.

## Features

- Interest-based communities with categories, rules, flairs, icons, and banners
- Text, image, link, and poll posts
- Hot, New, Top, Following, and discovery feeds
- Post and comment voting, saved posts, and YapScore reputation
- Threaded comments, replies, mentions, and deep-linked notifications
- Community moderation with reports, member controls, and moderation history
- User profiles, follows, blocking, and public activity
- One-to-one messaging with realtime updates, reactions, replies, read receipts, and message controls
- Responsive light and dark themes for desktop and mobile

## Tech stack

- React 18 + TypeScript
- Vite
- Tailwind CSS 4
- TanStack Query
- Supabase — PostgreSQL, Auth, Storage, Realtime, and Row Level Security
- Vercel

## Local development

### Requirements

- Node.js
- npm
- A Supabase project

### Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Start the development server:

```bash
npm run dev
```

Run a production build:

```bash
npm run build
```

Run lint checks:

```bash
npm run lint
```

## Project structure

```text
src/
  components/   Shared UI and product components
  context/      Authentication state
  lib/          Shared helpers and domain logic
  pages/        Route-level screens
supabase/
  migrations/   Database schema and policy migrations
public/         Brand and static assets
```

## Deployment

The frontend is deployed on Vercel and uses Supabase for backend services. Production environment variables must provide the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values used by the target Supabase project.

---

Yapster is an independent community platform built with React, TypeScript, Supabase, and Vercel.
