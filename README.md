# RevuMe

A private review application that allows users to write down what they think about places, food, movies, books, and just about anything using a 1-5 star rating. Made for my wife <3. Built with React for the front end and Python backend, 100% open source.

## Live app

- Frontend: https://revumeapp.netlify.app
- Backend: https://revume-api.onrender.com

The app runs on the free tiers of Netlify, Render, and Neon. Render puts it's free tier to sleep after 15 minutes of no traffic. So if you don't want to wait you should visit the backend url first to wake it up. It takes about 2-5 miniutes to wake up (they claim 50 seconds but everytime I've tested it, it has been more).

## Running Locally

### Things you need

- Node.js 20.19+ (or 22.12+)
- Python 3.12+ with the `python3-venv` package

### The Easy Way

I made an easy local testing script that you can run below that will start both back and front ends.

```bash
git clone https://github.com/KodyPrograms/revume.git
cd revume
chmod +x start_local.sh
./start_local.sh
```

Launches frontend on http://localhost:8000, and backend on http://localhost:5173, and opens the site in Chrome if available. Pressing Ctrl+C shuts them both down.

### The Harder Way

If you don't like things being easy you can do it this way as well.

```bash
# Terminal 1
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
DATABASE_URL=sqlite:///./revume.db ./.venv/bin/uvicorn main:app --reload
```

```bash
# Terminal 2
cd frontend
echo "VITE_API_BASE=http://localhost:8000" > .env.local
npm install
npm run dev
```



Visit http://localhost:5173. Database saves to `backend/revume.db`.

Enjoy!
