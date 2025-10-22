# RevuMe

A private review application that allows users to leave reviews for places, foods, movies, books, and more for their own information. Made with a React frontend and a Python backend, and fully open source.

## Live app

- Frontend: https://revumeapp.netlify.app
- Backend: https://revume-api.onrender.com

The project runs on the free tiers of Netlify and Render. Render automatically puts the backend to sleep after 15 minutes without traffic, so the first request may take a little longer while it wakes up. If you need to ensure it is awake, open the backend URL once before using the site.

## Run locally

### Prerequisites

- Node.js 20.19+ (or 22.12+)
- Python 3.12+ with the `python3-venv` package

### Quick start

```bash
git clone https://github.com/<your-org>/revume.git
cd revume
chmod +x start_local.sh
./start_local.sh
```

The helper script launches the FastAPI backend on http://localhost:8000, the Vite dev server on http://localhost:5173, and opens the site in Chrome if available. Press Ctrl+C to stop both processes.

### Manual setup

```bash
# Backend
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
DATABASE_URL=sqlite:///./revume.db ./.venv/bin/uvicorn main:app --reload
```

```bash
# Frontend (new terminal)
cd frontend
echo "VITE_API_BASE=http://localhost:8000" > .env.local
npm install
npm run dev
```

Visit http://localhost:5173, register an account, and create reviews. Data persists to `backend/revume.db`; delete that file to reset. The browser stores your auth token and theme preference in `localStorage`.
