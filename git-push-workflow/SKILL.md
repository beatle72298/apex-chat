---
name: git-push-workflow
description: Automates the process of checking status, diffing, adding, committing, and pushing changes to a git repository. Use when the user explicitly requests to "push" or "commit and push" changes.
---

# Git Push Workflow

## Overview

This skill guides the sequential process of safely committing and pushing changes to a remote repository.

## Workflow decide Tree

1. **Check Status**: `git status`
2. **Review Diffs**: `git diff HEAD`
3. **Stage Changes**: `git add .` (or specific files if requested)
4. **Prepare Commit**: 
   - Propose a concise, descriptive commit message based on the diff.
   - If multiple features were added, suggest a summary message.
5. **Commit**: `git commit -m "..."`
6. **Push**:
   - Determine current branch: `git branch --show-current`
   - Push to remote: `git push origin <branch>`

## Guidelines

- **Always** review `git diff` before adding files.
- **Never** push without user confirmation.
- **Prefer** small, atomic commits over one giant push when possible, but follow user direction.
- **Format**: Commit messages should be clear and imperative (e.g., "Add dark mode toggle" instead of "Added dark mode").

## Example Usage

**User**: "Push the changes we made to the client UI."

1. `git status` -> See modified files in `client/`.
2. `git diff HEAD` -> Verify changes to `renderer.html`, `renderer.js`.
3. `git add client/renderer.html client/renderer.js`
4. **Agent**: "I've reviewed the changes. I'll commit them with: 'Align client UI message bubbles and add settings icon'. Ready to push to main?"
5. `git commit -m "Align client UI message bubbles and add settings icon"`
6. `git push origin main`
