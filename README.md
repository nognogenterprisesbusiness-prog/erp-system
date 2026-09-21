# Nognog Enterprises

Web application for **Nognog Enterprises** ([nognogenterprises.com](https://www.nognogenterprises.com/)), design-and-build contractor based in Cebu City, Philippines (PCAB Category A).

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Linting**: [ESLint](https://eslint.org/)
- **Utilities**: `clsx`, `tailwind-merge` (`src/lib/utils.ts`)

## Getting Started

### Development Server

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Scripts

- `npm run dev`: Start Next.js development server
- `npm run build`: Create an optimized production build
- `npm run start`: Start the production server
- `npm run lint`: Run ESLint checks

## Project Structure

```
nognog-enterprises/
├── public/                 # Static assets (robots.txt, images, icons)
├── src/
│   ├── app/                # App Router pages and layouts
│   │   ├── globals.css     # Global styles & Tailwind CSS
│   │   ├── layout.tsx      # Root layout & SEO metadata
│   │   └── page.tsx        # Homepage
│   ├── components/         # Reusable UI components
│   └── lib/                # Utility functions (cn helper, etc.)
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Project dependencies and scripts
```
