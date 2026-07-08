'use strict';

gravity = vec2(0, 0);
cameraPos = vec2(0, 0);
cameraScale = 32;
debugWatermark = false;

const fieldSize = vec2(38, 22);
const paddleSize = vec2(0.7, 4);
const ballSize = vec2(0.7, 0.7);
const aiSpeed = 0.3;
const ballSpeed = 0.35;

let leftY;
let rightY;
let ball;
let ballVel;
let waitingToServe;
let serveDir;
let leftScore;
let rightScore;
let half;
let leftX;
let rightX;
let limitY;

function resetBall(dir)
{
    ball = vec2(0, 0);
    ballVel = vec2();
    waitingToServe = true;
    serveDir = dir;
}

function gameInit()
{
    leftY = rightY = 0;
    leftScore = rightScore = 0;
    resetBall(rand() < 0.5 ? -1 : 1);
}

function gameUpdate()
{
    half = fieldSize.scale(0.5);
    limitY = half.y - paddleSize.y / 2;
    leftX = -half.x + 1.5;
    rightX = half.x - 1.5;

    leftY = clamp(mousePos.y, -limitY, limitY);

    rightY = clamp(rightY + clamp(ball.y - rightY, -aiSpeed, aiSpeed), -limitY, limitY);

    if (waitingToServe)
    {
        if (mouseWasPressed(0))
        {
            ballVel = vec2(serveDir, rand(-0.5, 0.5)).normalize(ballSpeed);
            waitingToServe = false;
        }
        return;
    }

    ball = ball.add(ballVel);

    const ballR = ballSize.y / 2;
    if (ball.y > half.y - ballR)
    {
        ball.y = half.y - ballR;
        ballVel.y = -Math.abs(ballVel.y);
    }
    else if (ball.y < -half.y + ballR)
    {
        ball.y = -half.y + ballR;
        ballVel.y = Math.abs(ballVel.y);
    }

    if (ballVel.x < 0 && isOverlapping(ball, ballSize, vec2(leftX, leftY), paddleSize))
        bounceOffPaddle(leftX + (paddleSize.x + ballSize.x) / 2, leftY, 1);
    if (ballVel.x > 0 && isOverlapping(ball, ballSize, vec2(rightX, rightY), paddleSize))
        bounceOffPaddle(rightX - (paddleSize.x + ballSize.x) / 2, rightY, -1);

    if (ball.x < -half.x*1.5)
    {
        ++rightScore;
        resetBall(1);
    }
    else if (ball.x > half.x)
    {
        ++leftScore;
        resetBall(-1);
    }
}

function bounceOffPaddle(ballX, paddleY, dir)
{
    ball.x = ballX;
    ballVel.x = dir * Math.abs(ballVel.x);
    ballVel.y += (ball.y - paddleY) * 0.05;
    ballVel = ballVel.normalize(ballSpeed);
}

function gameUpdatePost()
{
}

function gameRender()
{
    for (let y = -half.y; y < half.y; y += 2)
        drawRect(vec2(0, y), vec2(0.2, 1.1), hsl(0, 0, 1, 0.4));

    drawRect(vec2(leftX, leftY), paddleSize, WHITE);
    drawRect(vec2(rightX, rightY), paddleSize, WHITE);
    drawRect(ball, ballSize, WHITE);
}

function gameRenderPost()
{
    const cx = mainCanvasSize.x / 2;
    drawTextScreen(leftScore, vec2(cx - 100, 70), 70, WHITE);
    drawTextScreen(rightScore, vec2(cx + 100, 70), 70, WHITE);
    if (waitingToServe)
        drawTextScreen('Click to serve', vec2(cx, mainCanvasSize.y - 90), 70, WHITE);
}

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
