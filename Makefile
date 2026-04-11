.PHONY: dev backend frontend install clean build demo-setup demo-metadata review-inventory-labels

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
	mkdir -p data/recordings data/audio-files data/processed data/spectrograms data/cache data/analysis
	$(MAKE) demo-metadata
	$(MAKE) review-inventory-labels
	@echo "Demo environment ready. Run 'make dev' to start."

demo-metadata:
	@if ls data/audio-files/*.wav >/dev/null 2>&1; then \
		python scripts/analyze_audio_files.py; \
		echo "Generated data/metadata.csv and analysis inventory from bundled audio-files."; \
	else \
		echo "No bundled WAV files found in data/audio-files; skipping metadata generation."; \
	fi

review-inventory-labels:
	@if [ -f data/analysis/audio_inventory.csv ]; then \
		python scripts/review_inventory_labels.py; \
	else \
		echo "Inventory file not found; run 'make demo-metadata' first."; \
	fi
