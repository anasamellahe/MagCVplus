# MagCV+

MagCV+ is a resume enhancement and management app. It accepts uploaded resumes (PDF), runs server-side processing to extract structured resume JSON, stores the JSON in object storage, and lets users preview, edit, and export enhanced resumes.

## Quick start

Requirements: Node.js and npm/yarn installed.

1. Clone the repo:
	git clone <YOUR_GIT_URL>
2. Install dependencies:
	npm install
3. Run dev server:
	npm run dev

## Project tech

- Vite + React + TypeScript
- Tailwind CSS and shadcn UI components
- Supabase for auth, storage, and edge functions (server-side AI extraction)

## Deployment

Build and deploy the app with your usual static hosting provider. Server-side functions (Supabase Edge Functions) must be deployed separately.

## Notes

- The repository previously included workspace metadata from a third-party tool; those references have been removed.
- If you plan to deploy the Supabase functions, ensure you set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your deployment environment.
