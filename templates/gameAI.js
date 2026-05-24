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
//       getOpponent(player),             // → player (optional convenience)
//   };
//   const move = alphaBetaAI(game, currentState, 4);
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

function alphaBetaAI(game, state, depth)
{
    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length) return null;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    for (const move of moves)
    {
        const next = game.applyMove(state, move, player);
        const score = alphaBetaValue(game, next, depth - 1, alpha, beta, player);
        if (score > bestScore)
        {
            bestScore = score;
            bestMove = move;
        }
        alpha = Math.max(alpha, bestScore);
    }
    return bestMove;
}

function alphaBetaValue(game, state, depth, alpha, beta, maxPlayer)
{
    if (depth === 0 || game.isTerminal(state))
        return game.evaluate(state, maxPlayer);
    const player = game.getCurrentPlayer(state);
    const moves = game.getLegalMoves(state, player);
    if (!moves.length)
        return game.evaluate(state, maxPlayer);
    const isMax = player === maxPlayer;
    if (isMax)
    {
        let best = -Infinity;
        for (const move of moves)
        {
            const next = game.applyMove(state, move, player);
            best = Math.max(best, alphaBetaValue(game, next, depth - 1, alpha, beta, maxPlayer));
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    }
    else
    {
        let best = Infinity;
        for (const move of moves)
        {
            const next = game.applyMove(state, move, player);
            best = Math.min(best, alphaBetaValue(game, next, depth - 1, alpha, beta, maxPlayer));
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}
