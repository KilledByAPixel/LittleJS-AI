'use strict';

// Round HTML must define `window.paints` as an array of 9 paint(ctx) functions
// before this script loads. Each paint runs on a 500x500 canvas.
//
// Click any cell to mark it as your current pick — the browser sends a
// `select` event over WebSocket and the server appends it to the session's
// events file. There is no commit button. Return to the Claude Code chat and
// say "ship it" / "more variations" / "cancel" / etc. — the agent reads the
// most recent select event plus your message and drives the next step.
(function () {
    const cells = document.querySelectorAll('.cell');

    // render each cell's canvas
    cells.forEach((el, i) => {
        const canvas = el.querySelector('canvas');
        if (!canvas) return;
        canvas.width = canvas.height = 500;
        const ctx = canvas.getContext('2d');
        try { window.paints[i](ctx, i); }
        catch (e) {
            ctx.fillStyle = '#400';
            ctx.fillRect(0, 0, 500, 500);
            ctx.fillStyle = '#fff';
            ctx.font = '20px monospace';
            ctx.fillText('paint error: ' + e.message, 10, 30);
        }
    });

    // WebSocket -- reload on push, send events on click
    const ws = new WebSocket('ws://' + location.host);
    ws.onmessage = e => {
        try { if (JSON.parse(e.data).type === 'reload') location.reload(); }
        catch (_) {}
    };
    function send(event) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
        else ws.addEventListener('open', () => ws.send(JSON.stringify(event)), { once: true });
    }

    // cell click = mark as current pick (visual + send select event)
    cells.forEach(el => {
        el.addEventListener('click', () => {
            const cellId = Number(el.dataset.cell);
            if (!Number.isInteger(cellId)) return;
            cells.forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            send({ type: 'select', cell: cellId });
        });
    });
})();
