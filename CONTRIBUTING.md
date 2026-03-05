# Contributing Guidelines

This project follows a structured Git workflow to keep the repository stable and maintain high code quality.

## Branching Rules

Do NOT push directly to `main`.

All development must happen in feature branches.

Branch naming format:

feature/<feature-name>
fix/<bug-name>
chore/<task>

Examples:

feature/backend-auth
feature/ai-agent-parser
fix/frontend-login-bug

---

## Development Workflow

1. Pull the latest changes

```
git checkout develop
git pull origin develop
```

1. Create a feature branch

```
git checkout -b feature/your-feature-name
```

1. Work on your code and commit changes

```
git add .
git commit -m "feat: implement feature"
```

1. Push the branch

```
git push origin feature/your-feature-name
```

1. Create a Pull Request

Open a Pull Request from your branch → `develop`.

---

## Code Review

All pull requests must be reviewed before merging.

The team lead reviews every change to ensure:

- Code quality
- Correct architecture
- No breaking changes

---

## Commit Message Convention

Use these prefixes:

feat: new feature
fix: bug fix
refactor: code improvement
docs: documentation update
chore: maintenance tasks

Example:

feat: add AI agent request handler

---

## Folder Responsibilities

Each member should work only in their assigned folder.

backend → backend developer
ai-agent → AI developer
dom-extension → extension developer
frontend → frontend developer

---

## Infrastructure

Run infrastructure locally with:

```
make dev
```

This starts the shared services required for development.
