# Architecture documentation

The root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) is the primary architecture
map. Durable decisions and their trade-offs live in [`docs/adr`](../adr/).

The MVP architecture is a modular monolith with a staged asynchronous AI
pipeline. Apps are delivery layers, domain packages own business meaning, and
external systems remain adapters.
