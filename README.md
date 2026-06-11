# InterVox — AI Voice Interview Platform

InterVox is an interview-practice platform that combines voice recognition, AI-powered evaluation, and progress analytics to help users prepare for technical and behavioral interviews.

Key features

- Practice voice or text answers to interview questions
- AI-assisted scoring and feedback
- Interview session recording and history
- Dashboard with progress analytics

Quick start

Prerequisites: Node.js (18+), npm or pnpm

1. Install dependencies

```bash
npm install
```

2. Run the frontend (development)

```bash
npm run dev
```

3. Backend (optional)

The backend lives in the `server/` folder. See [server/package.json](server/package.json) for available scripts. Typical steps:

```bash
cd server
npm install
# then run the backend script defined there (e.g. npm run dev)
```

Copy [server/.env.example](server/.env.example) to [server/.env](server/.env) and fill in your own local values before starting the backend.

Build for production

```bash
npm run build
```

Notes

- Dev server default URL: http://localhost:5173
- This repository contains frontend and server code under `src/` and `server/` respectively.

Contributing

Contributions are welcome. Please open issues or PRs and include clear reproduction steps.

License

No license file included. Add a `LICENSE` if you want to make this project open source.

---

If you'd like, I can add a `CONTRIBUTING.md`, a minimal `LICENSE`, or a short project overview file for the backend—tell me which next.
