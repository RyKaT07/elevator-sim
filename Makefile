.PHONY: run-sim run-front test install

install:
	cd sim && python3 -m venv ../.venv && . ../.venv/bin/activate && pip install -r ../requirements.txt
	cd frontend && npm install

run-sim:
	. .venv/bin/activate && uvicorn server.ws:app --host 0.0.0.0 --port 8000 --reload

run-front:
	cd frontend && npm run dev

test:
	. .venv/bin/activate && python -m pytest tests/ -v
