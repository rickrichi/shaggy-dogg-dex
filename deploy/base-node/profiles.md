# .env.node options (set before first sync)
- Pruned (default recommended on small disks): uncomment `RETH_PRUNING_ARGS` (distance must exceed 10064).
- Flashblocks (preconfirmation reads): uncomment `RETH_FB_WEBSOCKET_URL`.
- Archive/full history: leave pruning unset; needs much more disk. Cannot switch later.
