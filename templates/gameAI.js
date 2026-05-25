'use strict';

///////////////////////////////////////////////////////////////////////////////
// gameAI.js — generic AI strategies for turn-based two-player games.
//
// Usage:
//   const game = {
//       getLegalMoves(state, player),    // → [move, ...]
//       applyMove(state, move, player),  // → newState (fresh copy)
//       evaluate(state, player),         // → number (higher = better for `player`)
//       isTerminal(state),               // → bool
//       getCurrentPlayer(state),         // → player
//       getOpponent(player),             // → player
//   };
//   const move = alphaBetaAI(game, currentState, 4);
//
// `alphaBetaAI` internally uses iterative deepening, a transposition table,
// and a killer-move heuristic — the caller just supplies a max depth. The
// other strategies (randomAI, greedyAI, minimaxAI) are kept as a naive
// reference; alphaBetaAI is what production game integrations should use.
//
// All strategies return `null` if there are no legal moves — the caller
// decides whether to pass / end / etc.
//
// State is pure-functional: applyMove returns a fresh copy. No mutate-and-undo.
//
// Inside the search, if a player has no legal moves at some node, the
// strategy returns the static eval at that depth rather than recursing
// with a turn switch — this avoids infinite-pass loops in the tree. The
// game adapter's applyMove (called from the live game) is responsible
// for advancing past forced passes when the consumer applies a real move.

///////////////////////////////////////////////////////////////////////////////
// Strategies

function randomAI(game, state)
{
    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length) return null;
    return moves[Math.floor(Math.random() * moves.length)];
}

function greedyAI(game, state)
{
    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length) return null;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    for (const move of moves)
    {
        const next = game.applyMove(state, move, player);
        const score = game.evaluate(next, player);
        if (score > bestScore)
        {
            bestScore = score;
            bestMove = move;
        }
    }
    return bestMove;
}

function minimaxAI(game, state, depth)
{
    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length) return null;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    for (const move of moves)
    {
        const next = game.applyMove(state, move, player);
        const score = minimaxValue(game, next, depth - 1, player);
        if (score > bestScore)
        {
            bestScore = score;
            bestMove = move;
        }
    }
    return bestMove;
}

function minimaxValue(game, state, depth, maxPlayer)
{
    if (depth === 0 || game.isTerminal(state))
        return game.evaluate(state, maxPlayer);
    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length)
        return game.evaluate(state, maxPlayer);
    const isMax = player === maxPlayer;
    let best = isMax ? -Infinity : Infinity;
    for (const move of moves)
    {
        const next = game.applyMove(state, move, player);
        const value = minimaxValue(game, next, depth - 1, maxPlayer);
        best = isMax ? Math.max(best, value) : Math.min(best, value);
    }
    return best;
}

///////////////////////////////////////////////////////////////////////////////
// alphaBetaAI — alpha-beta search with three classical enhancements:
//   1. Iterative deepening: search d=1..depth in succession; each iteration
//      seeds the next via the transposition table and killer hints.
//   2. Transposition table (TT): Map keyed by JSON hash of {board,player},
//      storing {depth, score, flag, bestMove}.  Local to each call —
//      no cross-call pollution.
//   3. Killer-move heuristic: two killer slots per ply updated on beta
//      cutoffs; tried after the TT best-move in move ordering.

function alphaBetaAI(game, state, depth)
{
    const player = game.getCurrentPlayer(state);
    if (!game.getLegalMoves(state, player).length) return null;
    if (depth < 1) depth = 1; // clamp — depth 0 would skip the search loop entirely

    // Transposition table — local to this search invocation.
    const tt = new Map();

    // killers[ply] = [move1, move2]
    const killers = [];
    for (let i = 0; i <= depth; i++) killers.push([null, null]);

    let bestMove = null;

    // Iterative deepening: d = 1, 2, … depth.
    // The TT carries across iterations so each deeper pass benefits from
    // the previous iteration's best-move ordering.
    for (let d = 1; d <= depth; d++)
    {
        const result = alphaBetaSearch(game, state, d, -Infinity, Infinity, player, 0, tt, killers);
        if (result.move !== null)
            bestMove = result.move;
    }

    return bestMove;
}

// alphaBetaSearch — recursive negamax-style alpha-beta with TT and killers.
// Returns {score, move}.
function alphaBetaSearch(game, state, depth, alpha, beta, maxPlayer, ply, tt, killers)
{
    // Capture alpha before any TT adjustment — required for correct flag.
    const alphaOrig = alpha;

    // Transposition-table lookup.
    const hashKey = JSON.stringify({b: state.board, p: state.currentPlayer});
    const ttEntry = tt.get(hashKey);

    if (ttEntry && ttEntry.depth >= depth)
    {
        if (ttEntry.flag === 'exact')
            return {score: ttEntry.score, move: ttEntry.bestMove};
        if (ttEntry.flag === 'lowerbound')
            alpha = Math.max(alpha, ttEntry.score);
        else /* upperbound */
            beta = Math.min(beta, ttEntry.score);
        if (alpha >= beta)
            return {score: ttEntry.score, move: ttEntry.bestMove};
    }

    // Terminal / leaf node. If the adapter supports quiescence (provides
    // getCaptureMoves), use it to resolve in-progress capture sequences past
    // the depth limit. Otherwise return the static eval.
    if (game.isTerminal(state))
        return {score: game.evaluate(state, maxPlayer), move: null};
    if (depth === 0) {
        if (game.getCaptureMoves)
            return {score: quiescence(game, state, alpha, beta, maxPlayer, 0), move: null};
        return {score: game.evaluate(state, maxPlayer), move: null};
    }

    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length)
        return {score: game.evaluate(state, maxPlayer), move: null};

    // Move ordering: TT best-move first, then killers, then the rest.
    orderMoves(moves, ttEntry, killers[ply]);

    const isMax = player === maxPlayer;
    let bestScore = isMax ? -Infinity : Infinity;
    let bestMove = moves[0];

    for (const move of moves)
    {
        const next = game.applyMove(state, move, player);
        const childResult = alphaBetaSearch(
            game, next, depth - 1, alpha, beta, maxPlayer, ply + 1, tt, killers);
        const score = childResult.score;

        if (isMax)
        {
            if (score > bestScore) { bestScore = score; bestMove = move; }
            alpha = Math.max(alpha, bestScore);
        }
        else
        {
            if (score < bestScore) { bestScore = score; bestMove = move; }
            beta = Math.min(beta, bestScore);
        }

        if (beta <= alpha)
        {
            // Beta cutoff — record this as a killer move at this ply.
            recordKiller(killers[ply], move);
            break;
        }
    }

    // Store result in transposition table.
    let flag;
    if (bestScore <= alphaOrig)  flag = 'upperbound';
    else if (bestScore >= beta)  flag = 'lowerbound';
    else                         flag = 'exact';
    tt.set(hashKey, {depth, score: bestScore, flag, bestMove});

    return {score: bestScore, move: bestMove};
}

// quiescence — extend search past depth limit using capture moves only,
// to resolve in-progress trade sequences. Returns a scalar score (no move).
// Hard-capped at QUIESCENCE_MAX_PLY to prevent pathological infinite chains.
const QUIESCENCE_MAX_PLY = 8;

function quiescence(game, state, alpha, beta, maxPlayer, qPly)
{
    const standPat = game.evaluate(state, maxPlayer);
    const player = game.getCurrentPlayer(state);
    const isMax = player === maxPlayer;

    // Stand-pat: if not capturing already beats the current alpha (or fails beta),
    // we can stop here. The current player can always "choose not to capture."
    if (isMax) {
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (standPat < beta) beta = standPat;
    }

    if (qPly >= QUIESCENCE_MAX_PLY) return standPat;

    const captures = game.getCaptureMoves(state, player);
    if (!captures.length) return standPat;

    for (const move of captures) {
        const next = game.applyMove(state, move, player);
        const score = quiescence(game, next, alpha, beta, maxPlayer, qPly + 1);
        if (isMax) {
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        } else {
            if (score <= alpha) return alpha;
            if (score < beta) beta = score;
        }
    }
    return isMax ? alpha : beta;
}

// Move equality via JSON.stringify — generic across all current games'
// move shapes ({row,col}, {col}, {fromRow,fromCol,...,capture}).
const movesEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// orderMoves — in-place reorder: TT best-move to front, then killer moves.
function orderMoves(moves, ttEntry, killerPair)
{
    // Build hint list: [ttBestMove, killer0, killer1] in that priority order.
    // We insert them in reverse so that after all insertions the highest-
    // priority hint sits at index 0.
    const hints = [];
    if (ttEntry && ttEntry.bestMove) hints.push(ttEntry.bestMove);
    if (killerPair[0]) hints.push(killerPair[0]);
    if (killerPair[1]) hints.push(killerPair[1]);

    for (let i = hints.length - 1; i >= 0; i--)
    {
        const h = hints[i];
        for (let j = 0; j < moves.length; j++)
        {
            if (movesEqual(moves[j], h))
            {
                if (j !== 0)
                {
                    const m = moves.splice(j, 1)[0];
                    moves.unshift(m);
                }
                break;
            }
        }
    }
}

// recordKiller — update a ply's two killer slots with a new cutoff move.
function recordKiller(killerPair, move)
{
    if (killerPair[0] && movesEqual(killerPair[0], move)) return;
    killerPair[1] = killerPair[0];
    killerPair[0] = move;
}
