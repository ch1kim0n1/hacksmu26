# Agents

## Code changes

- Full-stack app: FastAPI backend (`echofield/`) + Next.js frontend (`frontend/`).
- Pipeline modules in `echofield/pipeline/` must preserve the interface expected by `hybrid_pipeline.py`.
- Pydantic models in `echofield/models.py` define the API contract — keep in sync with `server.py`.
- Config: `ECHOFIELD_*` env vars via `echofield/config.py`, YAML at `config/echofield.config.yml`.
- Frontend components organized by domain: `audio/`, `processing/`, `research/`, `spectrogram/`, `layout/`, `ui/`.
- Never modify files in `data/audio-files/` — those are source recordings.
- Runtime output goes to `data/cache/`, `data/processed/`, `data/spectrograms/` (all gitignored).

## Testing

- Backend tests: `pytest tests/` (20 test files covering API, pipeline, ML, data loading).
- Frontend tests: `cd frontend && npx vitest` (20 test files covering pages, components, hooks).
- Always run the relevant test suite before pushing.

## Commits

- Do not add `Co-Authored-By` lines to commit messages.
- Keep commit messages concise and descriptive of the actual change.
