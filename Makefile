.PHONY: dev backend frontend install clean build demo-setup

dev:
	@echo "Starting backend and frontend..."
	$(MAKE) backend &
	$(MAKE) frontend &
	wait

backend:
	python -m echofield

frontend:
	cd frontend && npm run dev

install:
	pip install -r requirements.txt
	cd frontend && npm install

build:
	cd frontend && npm run build

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf data/processed/* data/spectrograms/*
	rm -rf frontend/.next frontend/out

demo-setup: install
	mkdir -p data/recordings data/processed data/spectrograms
	@echo "Demo environment ready. Run 'make dev' to start."
