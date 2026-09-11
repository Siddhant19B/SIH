# Decentralized AMR SIH Prototype

## Runnable demo
Open `index.html` in a browser. It is the complete working prototype.

## Code organization for SIH explanation
- `js/astar.js` — A* shortest-path planning, heuristic, dynamic obstacles, live replanning.
- `js/tasks.js` — task creation, automatic nearest-AMR allocation, queue, reassignment and completion.
- `js/failure.js` — failed AMR handling, dynamic obstacle, P2P failure broadcast, takeover task.
- `js/simulation.js` — robot movement, pickup/delivery, play/pause, takeover return.
- `js/ui.js` — dashboard rendering, task queue, live node monitor and controls.
- `css/style.css` — dashboard styling.

## Judge explanation order
1. UI: select an AprilTag goal.
2. Tasks: system evaluates feasible AMRs using A* path distance.
3. A*: shortest feasible path is prepared locally.
4. Play: assigned AMRs move concurrently.
5. Failure: failed AMR becomes a dynamic obstacle.
6. Recovery: another AMR is assigned, moves to the failed AMR, picks up the parcel, then delivers it to the original goal.
7. Replanning: active AMRs recompute routes as dynamic conditions change.

## Important
The split files are for easy GitHub navigation and explanation. The current `index.html` is the authoritative runnable prototype and contains the complete integrated code.
