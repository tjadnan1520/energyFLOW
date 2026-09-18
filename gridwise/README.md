# GridWise LLM

AI-assisted 24-hour energy scheduling API for the BUP CSE Fest 2026 GridWise LLM challenge.

GridWise receives a 24-hour energy scenario and 1-3 natural-language operator notes. The operator notes are interpreted by an LLM into machine-checkable directives. The directives are then validated deterministically, compiled into optimization constraints, and applied by a mathematical optimizer to produce a valid minimum-cost 24-hour energy schedule.

---

## Architecture

```text
                   ┌─────────────────────┐
                   │       Judge         │
                   └──────────┬──────────┘
                              │
                              │ POST /optimize-energy
                              ▼
                   ┌─────────────────────┐
                   │   Zod Validation    │
                   │   Request Schema    │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │   Gemini 2.5 Flash  │
                   │ Operator Note       │
                   │ Interpretation      │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Deterministic       │
                   │ Guardrails          │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Directive Compiler  │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ HiGHS Optimizer     │
                   │ LP / MIP            │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ 24-Hour Schedule    │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Independent Replay  │
                   │ Validator           │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Machine-checkable   │
                   │ JSON Response       │
                   └─────────────────────┘