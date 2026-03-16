#!/usr/bin/env bash
# sync-upstream.sh — Safely sync Ultron with upstream Mission Control
# Usage: ./scripts/sync-upstream.sh [--dry-run]
#
# This script:
# 1. Stashes any uncommitted work
# 2. Fetches upstream changes
# 3. Shows what's new (files, commits)
# 4. Identifies conflicts with our custom files
# 5. Merges with --no-commit so you can review before finalizing
# 6. Runs typecheck + build to verify nothing broke

set -euo pipefail

UPSTREAM_REMOTE="origin"
UPSTREAM_BRANCH="main"
DRY_RUN="${1:-}"

# Files we've customized that are conflict-prone
CONFLICT_PRONE_FILES=(
  "src/app/[[...panel]]/page.tsx"
  "src/components/layout/nav-rail.tsx"
  "src/app/login/page.tsx"
  "src/components/dashboard/sidebar.tsx"
  "src/components/onboarding/onboarding-wizard.tsx"
  "src/components/ui/loader.tsx"
  "src/nav-rail.tsx"
)

echo "=== Ultron Upstream Sync ==="
echo ""

# Step 1: Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[WARN] Uncommitted changes detected. Stashing..."
  git stash push -m "sync-upstream: auto-stash $(date +%Y%m%d-%H%M%S)"
  STASHED=1
else
  STASHED=0
fi

# Step 2: Fetch upstream
echo "[1/6] Fetching upstream ($UPSTREAM_REMOTE/$UPSTREAM_BRANCH)..."
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

# Step 3: Count new commits
NEW_COMMITS=$(git log HEAD..FETCH_HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ "$NEW_COMMITS" -eq 0 ]; then
  echo "[INFO] Already up to date. No new upstream commits."
  if [ "$STASHED" -eq 1 ]; then
    git stash pop
  fi
  exit 0
fi

echo "[2/6] Found $NEW_COMMITS new upstream commit(s):"
git log HEAD..FETCH_HEAD --oneline
echo ""

# Step 4: Show changed files upstream
echo "[3/6] Files changed upstream:"
UPSTREAM_CHANGED=$(git diff --name-only HEAD...FETCH_HEAD)
echo "$UPSTREAM_CHANGED"
echo ""

# Step 5: Identify potential conflicts
echo "[4/6] Checking for conflicts with our customized files..."
CONFLICT_COUNT=0
for file in "${CONFLICT_PRONE_FILES[@]}"; do
  if echo "$UPSTREAM_CHANGED" | grep -qF "$file"; then
    echo "  ⚠️  CONFLICT RISK: $file (modified both locally and upstream)"
    CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
  fi
done

if [ "$CONFLICT_COUNT" -eq 0 ]; then
  echo "  ✅ No conflicts expected with our customized files"
fi
echo ""

# Dry run stops here
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "[DRY RUN] Would merge $NEW_COMMITS commits. Exiting without changes."
  if [ "$STASHED" -eq 1 ]; then
    git stash pop
  fi
  exit 0
fi

# Step 6: Merge with --no-commit for review
echo "[5/6] Merging upstream (--no-commit for review)..."
if git merge --no-commit --no-ff FETCH_HEAD 2>&1; then
  echo "  ✅ Merge applied cleanly"
else
  echo ""
  echo "  ⚠️  Merge conflicts detected. Resolve manually:"
  git diff --name-only --diff-filter=U
  echo ""
  echo "  After resolving, run:"
  echo "    git add <resolved-files>"
  echo "    npx tsc --noEmit && pnpm build && pnpm test"
  echo "    git commit"
  if [ "$STASHED" -eq 1 ]; then
    echo "    git stash pop  # (your stashed changes)"
  fi
  exit 1
fi

# Step 7: Verify build
echo "[6/6] Running verification..."
echo "  → TypeScript check..."
if npx tsc --noEmit 2>&1; then
  echo "  ✅ TypeScript: clean"
else
  echo "  ❌ TypeScript errors found. Review merge before committing."
  echo "  Run: git merge --abort  to undo"
  exit 1
fi

echo "  → Production build..."
if pnpm build 2>&1 | tail -5; then
  echo "  ✅ Build: clean"
else
  echo "  ❌ Build failed. Review merge before committing."
  echo "  Run: git merge --abort  to undo"
  exit 1
fi

echo ""
echo "=== Merge ready for commit ==="
echo "Review staged changes with: git diff --cached --stat"
echo "Commit with: git commit -m 'chore: sync upstream mission-control'"
echo ""

if [ "$STASHED" -eq 1 ]; then
  echo "Don't forget to: git stash pop"
fi
