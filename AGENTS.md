# Agents

## Code changes

- This is a full-stack web application: FastAPI backend (`echofield/`) + Next.js frontend (`frontend/`).
- The processing pipeline lives in `echofield/pipeline/`. Changes to pipeline modules should preserve the interface expected by `hybrid_pipeline.py` (the orchestrator).
- Pydantic models in `echofield/models.py` define the API contract — keep them in sync with `server.py` routes.
- Config is loaded from `ECHOFIELD_*` env vars via `echofield/config.py`. The YAML config at `config/echofield.config.yml` holds noise profiles and pipeline parameters.
- Frontend components are organized by domain: `audio/`, `processing/`, `research/`, `spectrogram/`, `layout/`.
- Never modify files in `data/recordings/` — those are source recordings.
- Output goes to `data/processed/` and `data/spectrograms/`.

## Testing

- No test suite currently exists. Verify backend changes by running the FastAPI server (`python -m echofield`) and hitting endpoints.
- Verify frontend changes by running the dev server (`cd frontend && npm run dev`) and checking the UI in browser.
- For pipeline changes, process a sample recording and inspect output audio + spectrogram PNG.

## Commits

- Do not add `Co-Authored-By` lines to commit messages.
- Keep commit messages concise and descriptive of the actual change.
