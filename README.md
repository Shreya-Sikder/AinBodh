# AinBodh — Complete Frontend

React + TypeScript + Tailwind CSS + React Router + Lucide React frontend for the AinBodh Bangladesh-focused legal document assistant.

## What is implemented

- Public landing page with FAQ and language toggle
- Login and sign-up flows
- Authenticated application shell with sidebar and top bar
- Dashboard
- New Inquiry / document upload
- File picker and drag/drop
- Text input
- Voice-input UI
- Human verification step before analysis
- Analysis progress screen
- Full document analysis dashboard
- 2-minute overview
- Key information extraction UI
- Areas Requiring Attention
- Potential contradiction detection UI
- Potentially missing or unclear UI
- Evidence/citation chips
- Document viewer with page navigation, zoom, fullscreen and preview download
- Legal-term explanation
- Read-aloud using browser Speech Synthesis
- Document-grounded chat UI
- Suggested questions
- My Chats with search/open/delete interactions
- Emergency Helpline page in English and Bangla
- Settings and accessibility controls
- Text-size control
- Voice toggle and playback speed
- High-contrast mode
- Simple-language preference
- Cross-document comparison UI
- Reusable frontend components and backend data contracts
- English/Bangla state across the application

## Backend boundary

`src/services/api.ts` contains mock implementations for:

- `login`
- `signup`
- `uploadDocument`
- `analyzeDocument`
- `askQuestion`

`src/services/apiContract.ts` documents the recommended production API types and endpoints.

The intended production flow is:

`React UI → API service → backend → OCR/extraction → Bangladesh legal RAG → LLM → evidence/citations → React UI`

Replace the mock service functions with real HTTP calls while keeping the existing page components and UI.

## Important product behavior

The UI deliberately uses language such as:

- Areas Requiring Attention
- Potential contradiction
- Potentially missing or unclear
- Not found in the provided document

It does not claim that a clause is illegal or tell the user whether to sign.

## Run

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Environment

Copy `.env.example` to `.env` and set the backend URL when your API is ready.
