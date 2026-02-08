# Bug: Cards disappear when dragged between columns

## Symptoms
When dragging a task card from one column to another (e.g. Backlog → In Progress) and dropping it — either on the column area or over another card — the card disappears visually.

## What works
- State updates correctly (console logs confirm the task's columnId changes)
- The task IS in the tasks array with the correct new columnId
- Collision detection works (over.id correctly identifies the target column)

## What doesn't work
- The card is not visible in the target column after drop
- This happens regardless of where in the column you drop (empty area or on a card)

## Setup
- @dnd-kit/core: TaskCard uses `useDraggable`, Column uses `useDroppable`
- Collision detection: custom (pointerWithin + rectIntersection fallback)
- TaskCard currently uses a plain `div` (was `motion.div` before, same bug either way)
- Column drop zone has `overflow-y-auto`

## Files to investigate
- `packages/client/src/components/Board.tsx` — DnD context, handleDragEnd
- `packages/client/src/components/Column.tsx` — useDroppable
- `packages/client/src/components/TaskCard.tsx` — useDraggable, transform/style handling
- `packages/client/src/hooks/useTasks.ts` — moveTask state update

## Key clue
The state is correct but the DOM doesn't show the card. This suggests either:
1. CSS transform from useDraggable persists after remount (card rendered off-screen)
2. The component isn't mounting in the new column despite state change
3. Some CSS (overflow, z-index, opacity) is hiding the card

After fixing, rebuild with: `cd packages/client && npx vite build`
