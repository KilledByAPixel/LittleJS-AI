'use strict';

// engine settings
debugWatermark = false;
showEngineVersion = false;

///////////////////////////////////////////////////////////////////////////////
// game state
let mouseJoint;
let groundObject;

///////////////////////////////////////////////////////////////////////////////
async function gameInit()
{
    // setup box2d first!
    await box2dInit();

    // setup world
    canvasClearColor = hsl(0,0,.9);
    cameraScale = 32;
    mouseJoint = 0;
    gravity.y = -50;

    // create ground object
    groundObject = new Box2dStaticObject(vec2(-8));
    groundObject.color = GRAY;
    groundObject.addBox(vec2(100,2));

    // add some random objects
    for (let i=50; i--;)
    {
        const pos = randInCircle(5);
        const color = randColor();
        const o = new Box2dObject(pos, vec2(), 0, 0, color);
        randInt(2) ? o.addCircle(rand(1,2)) : o.addRandomPoly(rand(1,2));
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // mouse joint controls
    if (mouseJoint)
    {
        // update mouse joint
        mouseJoint.setTarget(mousePos);
        if (mouseWasReleased(0))
        {
            // release object
            mouseJoint = mouseJoint.destroy();
        }
    }
    else if (mouseWasPressed(0))
    {
        // grab object under the cursor
        const object = box2d.pointCast(mousePos);
        if (object)
            mouseJoint = new Box2dTargetJoint(object, groundObject, mousePos);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // called after physics and objects are updated
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // called before objects are rendered
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw a title
    drawTextScreen('Box2D Physics',
        vec2(mainCanvasSize.x/2, 70), 80,   // position, size
        hsl(0,0,1), 6, hsl(0,0,0));         // color, outline size and color

    // draw the mouse joint line
    mouseJoint && drawLine(mousePos, mouseJoint.getAnchorB(), .2, RED);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
