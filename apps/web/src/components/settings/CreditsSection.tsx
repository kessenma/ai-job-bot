import { Heart, ArrowSquareOut, Package, Star } from '@phosphor-icons/react'
import { CollapsibleSection } from '#/components/ui/CollapsibleSection.tsx'

type Credit = {
  name: string
  project: string
  description: string
  url: string
  license: string
}

const INSPIRATION_CREDITS: Credit[] = [
  {
    name: 'Ammar Abdur Raheman',
    project: 'linkedin-easy-apply',
    description: 'LinkedIn Easy Apply automation with Playwright — login, search, and form-fill patterns.',
    url: 'https://github.com/AmmarAR97/linkedin-easy-apply',
    license: 'MIT',
  },
  {
    name: 'Unisa Bangura',
    project: 'Workday-Application-Automator',
    description: 'Workday application automation — auto-fills contact, education, and demographic info.',
    url: 'https://github.com/ubangura/Workday-Application-Automator',
    license: 'ISC',
  },
  {
    name: 'Yuqi Li (lookr-fyi)',
    project: 'job-application-bot-by-ollama-ai',
    description: 'AI job application bot with Ollama — confidence-based queue, iterative learning, and multi-platform apply patterns.',
    url: 'https://github.com/lookr-fyi/job-application-bot-by-ollama-ai',
    license: 'Unlicensed',
  },
  {
    name: 'Kavish Hukmani',
    project: 'cover-letter-llm',
    description: 'LLM-powered cover letter generator — classic/modern style modes, resume parsing, and job description scraping.',
    url: 'https://github.com/DoubleGremlin181/cover-letter-llm',
    license: 'Unlicensed',
  },
  {
    name: 'Paul McInnis',
    project: 'JobFunnel',
    description: 'Automated job scraping into CSV from multiple job search websites — filtering and deduplication patterns.',
    url: 'https://github.com/PaulMcInnis/JobFunnel',
    license: 'MIT',
  },
  {
    name: 'Cullen Watson',
    project: 'JobSpy',
    description: 'Multi-board job scraper aggregating LinkedIn, Indeed, Glassdoor, ZipRecruiter, and Google Jobs into a unified pandas DataFrame.',
    url: 'https://github.com/Bunsly/JobSpy',
    license: 'MIT',
  },
  {
    name: 'AI Hawk FOSS',
    project: 'Auto_Jobs_Applier_AI_Agent',
    description: 'AI-powered web agent for LinkedIn job applications — LLM-based form filling and job description matching.',
    url: 'https://github.com/AIHawk-FOSS/Auto_Jobs_Applier_AI_Agent',
    license: 'AGPL-3.0',
  },
  {
    name: 'Hariom Kumar',
    project: 'Resume-CoverLetterGenerator-LLM',
    description: 'Resume and cover letter generation with local Ollama LLM — Streamlit UI with PDF output.',
    url: 'https://github.com/hari7261/Resume-CoverLetterGenerator-LLM',
    license: 'MIT',
  },
]

const LIBRARY_CREDITS: Credit[] = [
  // Frontend — UI & Framework
  {
    name: 'Meta',
    project: 'React',
    description: 'Declarative UI library for building component-based user interfaces.',
    url: 'https://github.com/facebook/react',
    license: 'MIT',
  },
  {
    name: 'TanStack',
    project: 'TanStack Router',
    description: 'Type-safe file-based routing, SSR, and data loading for React.',
    url: 'https://github.com/TanStack/router',
    license: 'MIT',
  },
  {
    name: 'TanStack',
    project: 'TanStack Table',
    description: 'Headless, type-safe table and data-grid primitives for React.',
    url: 'https://github.com/TanStack/table',
    license: 'MIT',
  },
  {
    name: 'shadcn',
    project: 'shadcn/ui',
    description: 'Copy-paste component library built on Radix UI and Tailwind CSS.',
    url: 'https://github.com/shadcn-ui/ui',
    license: 'MIT',
  },
  {
    name: 'Base UI',
    project: '@base-ui/react',
    description: 'Unstyled, accessible React UI primitives from the MUI team.',
    url: 'https://github.com/mui/base-ui',
    license: 'MIT',
  },
  // Frontend — Styling
  {
    name: 'Tailwind Labs',
    project: 'Tailwind CSS',
    description: 'Utility-first CSS framework for rapid UI development.',
    url: 'https://github.com/tailwindlabs/tailwindcss',
    license: 'MIT',
  },
  {
    name: 'Joe Bell',
    project: 'class-variance-authority',
    description: 'Variant-driven class name utility for component styling.',
    url: 'https://github.com/joe-bell/cva',
    license: 'Apache-2.0',
  },
  {
    name: 'Dany Castillo',
    project: 'tailwind-merge',
    description: 'Intelligently merges Tailwind CSS classes without conflicts.',
    url: 'https://github.com/dcastil/tailwind-merge',
    license: 'MIT',
  },
  // Frontend — Icons
  {
    name: 'Phosphor Icons',
    project: '@phosphor-icons/react',
    description: 'Flexible, consistent icon family for React interfaces.',
    url: 'https://github.com/phosphor-icons/react',
    license: 'MIT',
  },
  {
    name: 'Lucide',
    project: 'lucide-react',
    description: 'Beautiful, community-maintained open-source icon set for React.',
    url: 'https://github.com/lucide-icons/lucide',
    license: 'ISC',
  },
  // Frontend — Animation
  {
    name: 'GSAP',
    project: 'GSAP',
    description: 'Professional-grade JavaScript animation library.',
    url: 'https://github.com/greensock/GSAP',
    license: 'Standard',
  },
  {
    name: 'Matt Perry',
    project: 'Motion',
    description: 'Production-ready animations and gestures for React (formerly Framer Motion).',
    url: 'https://github.com/motiondivision/motion',
    license: 'MIT',
  },
  // Frontend — Utilities
  {
    name: 'Matt Zabriskie',
    project: 'PapaParse',
    description: 'Fast, powerful CSV parser for the browser and Node.js.',
    url: 'https://github.com/mholt/PapaParse',
    license: 'MIT',
  },
  {
    name: 'pdf-parse',
    project: 'pdf-parse',
    description: 'Pure-JS PDF text extraction for Node.js.',
    url: 'https://github.com/nickallan/pdf-parse',
    license: 'MIT',
  },
  {
    name: 'Mammoth.js',
    project: 'mammoth',
    description: 'Converts .docx documents into clean HTML or plain text.',
    url: 'https://github.com/mwilliamson/mammoth.js',
    license: 'BSD-2-Clause',
  },
  // Build & Dev
  {
    name: 'Vite',
    project: 'Vite',
    description: 'Next-generation frontend build tool with instant HMR.',
    url: 'https://github.com/vitejs/vite',
    license: 'MIT',
  },
  {
    name: 'Vitest',
    project: 'Vitest',
    description: 'Blazing-fast Vite-native unit testing framework.',
    url: 'https://github.com/vitest-dev/vitest',
    license: 'MIT',
  },
  // Database & APIs
  {
    name: 'Drizzle Team',
    project: 'Drizzle ORM',
    description: 'Lightweight, type-safe TypeScript ORM for SQL databases.',
    url: 'https://github.com/drizzle-team/drizzle-orm',
    license: 'Apache-2.0',
  },
  {
    name: 'Google',
    project: 'googleapis',
    description: 'Official Node.js client for Google APIs (Gmail, Sheets, Drive, etc.).',
    url: 'https://github.com/googleapis/google-api-nodejs-client',
    license: 'Apache-2.0',
  },
  // Playwright service
  {
    name: 'Yusuke Wada',
    project: 'Hono',
    description: 'Ultrafast, lightweight web framework for the edge and Node.js.',
    url: 'https://github.com/honojs/hono',
    license: 'MIT',
  },
  {
    name: 'Microsoft',
    project: 'Playwright',
    description: 'Cross-browser end-to-end testing and automation framework.',
    url: 'https://github.com/microsoft/playwright',
    license: 'Apache-2.0',
  },
  // LLM service (Python)
  {
    name: 'Sebastián Ramírez',
    project: 'FastAPI',
    description: 'High-performance Python web framework for building APIs.',
    url: 'https://github.com/fastapi/fastapi',
    license: 'MIT',
  },
  {
    name: 'Encode',
    project: 'Uvicorn',
    description: 'Lightning-fast ASGI server for Python web apps.',
    url: 'https://github.com/encode/uvicorn',
    license: 'BSD-3-Clause',
  },
  {
    name: 'Andrei Betlen',
    project: 'llama-cpp-python',
    description: 'Python bindings for llama.cpp — run LLMs locally with GGUF models.',
    url: 'https://github.com/abetlen/llama-cpp-python',
    license: 'MIT',
  },
  {
    name: 'Samuel Colvin',
    project: 'Pydantic',
    description: 'Data validation and settings management using Python type annotations.',
    url: 'https://github.com/pydantic/pydantic',
    license: 'MIT',
  },
  {
    name: 'Hugging Face',
    project: 'huggingface_hub',
    description: 'Python client for downloading and managing models from the Hugging Face Hub.',
    url: 'https://github.com/huggingface/huggingface_hub',
    license: 'Apache-2.0',
  },
  {
    name: 'UKP Lab',
    project: 'sentence-transformers',
    description: 'State-of-the-art sentence, text, and image embeddings for Python.',
    url: 'https://github.com/UKPLab/sentence-transformers',
    license: 'Apache-2.0',
  },
]

function CreditCard({ credit }: { credit: Credit }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--sea-ink)]">{credit.project}</span>
          <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
            {credit.license}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
          by {credit.name}
        </div>
        <div className="mt-1 text-sm text-[var(--sea-ink-soft)]">
          {credit.description}
        </div>
      </div>
      <a
        href={credit.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
      >
        <ArrowSquareOut className="mr-1 inline h-3 w-3" />
        GitHub
      </a>
    </div>
  )
}

export function CreditsSection() {
  return (
    <section className="island-shell mb-6 mt-6 rounded-2xl p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <Heart className="h-5 w-5 text-[var(--lagoon)]" />
        Credits
      </h2>

      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        This project builds on the work of these open-source authors and projects.
      </p>

      <CollapsibleSection
        trigger={(_open) => (
          <div className="flex items-center gap-2 py-2">
            <Star className="h-4 w-4 text-[var(--lagoon)]" />
            <span className="text-base font-semibold text-[var(--sea-ink)]">Inspiration</span>
            <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold text-[var(--sea-ink-soft)]">
              {INSPIRATION_CREDITS.length}
            </span>
          </div>
        )}
      >
        <div className="mt-3 space-y-3">
          {INSPIRATION_CREDITS.map((c) => (
            <CreditCard key={c.project} credit={c} />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        trigger={(_open) => (
          <div className="mt-4 flex items-center gap-2 py-2">
            <Package className="h-4 w-4 text-[var(--lagoon)]" />
            <span className="text-base font-semibold text-[var(--sea-ink)]">Libraries &amp; Frameworks</span>
            <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold text-[var(--sea-ink-soft)]">
              {LIBRARY_CREDITS.length}
            </span>
          </div>
        )}
      >
        <div className="mt-3 space-y-3">
          {LIBRARY_CREDITS.map((c) => (
            <CreditCard key={c.project} credit={c} />
          ))}
        </div>
      </CollapsibleSection>
    </section>
  )
}
