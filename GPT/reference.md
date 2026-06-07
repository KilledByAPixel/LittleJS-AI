# LittleJS Engine Quick Reference

Curated API cheat sheet for building small prototypes with the pre-built sprite atlas + shape primitives (no external assets). For exact behavior or anything not listed here, search the full engine source `littlejs.js`.

- [LittleJS on GitHub](https://github.com/KilledByAPixel/LittleJS)
- [LittleJS Documentation](https://killedbyapixel.github.io/LittleJS/docs)
- [Particle System Designer](https://killedbyapixel.github.io/LittleJS/examples/particles)
- [Sound Effect Designer (ZzFX)](https://killedbyapixel.github.io/ZzFX)

## Setup

Create these callbacks and pass them to engineInit:

```javascript
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost)
// gameInit       - once at startup (async; await box2dInit() here for physics)
// gameUpdate     - input + game logic every frame (60fps)
// gameUpdatePost - after physics/objects update (camera setup)
// gameRender     - world-space drawing behind objects (backgrounds)
// gameRenderPost - drawing / HUD above objects
```

## Math, Vectors, Color, Timer

```javascript
// Object constructors
vec2(x=0, y=x)         // Create a 2D vector from a Vector2 or floats
rgb(r=1, g=1, b=1, a=1) // Create a color from RGBA values
hsl(h=0, s=0, l=1, a=1) // Create a color from HSLA values

// Named colors: WHITE BLACK CLEAR_WHITE RED ORANGE YELLOW GREEN CYAN BLUE PURPLE MAGENTA GRAY
// (CLEAR_WHITE is white with alpha 0 - use it as the outer color of a gradient so it fades out)

// Helper math
abs(value)                                    // Absolute value
min(...values) / max(...values)               // Lowest / highest of values
sign(value)                                   // Sign of value (-1, 0, 1)
mod(dividend, divisor=1)                       // Remainder (always positive)
clamp(value, min=0, max=1)                     // Clamp between values
percent(value, valueA, valueB)                 // Percentage between values
lerp(valueA, valueB, percent)                  // Linear interpolate (percent is LAST)
smoothStep(percent)                            // Smoothstep easing
distanceWrap(valueA, valueB, wrapSize=1)       // Signed wrapped distance
lerpWrap(valueA, valueB, percent, wrapSize=1)  // Wrapped lerp
distanceAngle(angleA, angleB)                  // Signed wrapped angle distance
lerpAngle(angleA, angleB, percent)             // Wrapped angle lerp
isOverlapping(pointA, sizeA, pointB, sizeB)    // AABB overlap test
isIntersecting(start, end, pos, size)          // Ray vs box test

// Random
rand(valueA=1, valueB=0)            // Random float between values
randInt(valueA, valueB=0)           // Random integer between values
randBool(chance=.5)                 // Random boolean
randSign()                          // Randomly -1 or 1
randVec2(length=1)                  // Random Vector2 of given length
randInCircle(radius=1, minRadius=0) // Random Vector2 within a circle
randColor(colorA, colorB, linear)   // Random color between values

// Vector2 (immutable math - methods return new vectors)
Vector2(x=0, y=0)
v.copy() / v.add(v) / v.subtract(v) / v.multiply(v) / v.divide(v)
v.scale(s)                          // Scale by a float
v.length() / v.lengthSquared()      // Length
v.distance(v) / v.distanceSquared(v)// Distance to another vector
v.normalize(length=1)               // Unit (or given length) vector
v.clampLength(length=1)             // Cap length
v.dot(v) / v.cross(v)               // Dot / cross product
v.floor() / v.area()                // Floor / x*y
v.lerp(v, percent)                  // Interpolate toward another vector
v.angle()                           // Angle of vector (up is 0)
v.setAngle(angle=0, length=1)       // Build from angle + length
v.rotate(angle)                     // Rotate by angle
v.direction()                       // Integer direction 0-3

// Color
Color(r=1, g=1, b=1, a=1)
c.copy() / c.add(c) / c.subtract(c) / c.multiply(c) / c.divide(c)
c.scale(scale, alphaScale=scale)    // Scale channels
c.lerp(c, percent)                  // Interpolate toward another color
c.setHSLA(h, s, l, a) / c.HSLA()    // HSLA get/set
c.mutate(amount=.05, alphaAmount=0) // Randomly diverge
c.setHex(hex) / c.toString()        // Hex get/set
c.setAlpha(a) / c.withAlpha(a)      // Alpha set / copy-with-alpha

// Timer - tracks elapsed time automatically
Timer(timeLeft)        // Create (optionally set)
t.set(timeLeft=0) / t.unset()
t.isSet() / t.active() / t.elapsed()
t.get() / t.getPercent()            // Time since elapsed / percent elapsed

// Frame globals
time          // Seconds since startup
timeDelta     // Seconds per frame (1/60)
frame         // Frame counter
```

## Drawing (world space by default; each has a screenSpace param)

```javascript
// Shape primitives
drawCircle(pos, diameter=1, color=WHITE, lineWidth=0, lineColor=BLACK)
drawEllipse(pos, size=(1,1), color=WHITE, angle=0, lineWidth=0, lineColor=BLACK) // size = w/h diameters
drawRect(pos, size, color=WHITE, angle=0)
drawRegularPoly(pos, size=(1,1), sides=3, color=WHITE, lineWidth=0, lineColor=BLACK, angle=0)
drawPoly(points, color=WHITE, lineWidth=0, lineColor=BLACK, pos, angle=0) // points = array of vec2
drawLine(posA, posB, width=.1, color=WHITE)
drawLineList(points, width=.1, color, wrap=false, pos, angle=0)

// Sprite atlas tiles - the starter bakes 16 white icons into the `icons` map; color tints each tile
drawTile(pos, size, tileInfo, color=WHITE, angle=0, mirror, additiveColor) // size is a vec2 (full diameter)
// icons.NAME (a TileInfo): circle glow ring roundSquare triangle diamond pentagon hexagon
//                          spark star burst plus heart droplet bolt arrow
// additive glow FX: drawTile(pos, size, icons.glow, color, 0, false, new Color(1,1,1,0)) // additiveColor alpha 0

// Gradients (use CLEAR_WHITE as the outer/bottom color to fade out - great for glows)
drawCircleGradient(pos, diameter=1, colorInner=WHITE, colorOuter=CLEAR_WHITE)
drawEllipseGradient(pos, size=(1,1), colorInner=WHITE, colorOuter=CLEAR_WHITE, angle=0)
drawRectGradient(pos, size, colorTop=WHITE, colorBottom=CLEAR_WHITE, angle=0)

// Text
drawText(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK)        // world space (size ~3)
drawTextScreen(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK)  // screen space (size ~80)

// Blend mode (for additive glow FX)
setAdditiveBlendMode(additive)

// Camera
cameraPos = (0,0)        // Camera position in world space
cameraScale = 32         // World units to pixels (larger = more zoomed in)
screenToWorld(screenPos) // Screen -> world coordinates
worldToScreen(worldPos)  // World -> screen coordinates
getCameraSize()          // Visible area in world space
cameraFit(center, size, worldMargin, screenInset) // Fit camera to a world rectangle

// Display settings
canvasClearColor = BLACK // Color used to clear the canvas each frame
fontDefault = 'arial'    // Default font for text
showSplashScreen = false // LittleJS splash on startup
glEnable = true          // Fast WebGL rendering
```

## Audio

The starter `index.html` defines a `SoundGenerator` class (a `Sound` subclass) for asset-free
sound effects - construct it with `{frequency, slide, ...}` and call `.play()`.

```javascript
// Sound (ZzFX procedural sounds; no files needed)
Sound(zzfxSound, randomness, range, taper)
Sound.play(pos, volume=1, pitch=1, randomness=1, loop=false) // Returns SoundInstance (pass pos for positional)
Sound.playNote(semitoneOffset, pos, volume=1)               // Play as a musical note

// SoundInstance (control a playing sound)
i.setVolume(volume) / i.stop(fadeTime=0) / i.pause() / i.unpause()
i.isPlaying() / i.isPaused() / i.getCurrentTime() / i.getDuration()

// Misc
speak(text, volume=1, rate=1, pitch=1, language='') // Text to speech
getNoteFrequency(semitoneOffset, rootFrequency=220) // Frequency for musical notes

// Settings
soundEnable = true   // Enable sound?
soundVolume = .5     // Master volume
```

## Input

```javascript
// Keyboard
keyIsDown(key)       // Is key down? (use for non-directional actions: jump, run, fire)
keyWasPressed(key)   // Pressed this frame?
keyWasReleased(key)  // Released this frame?
keyDirection()       // Movement vector from arrows/WASD (use for ALL directional input)

// Mouse / Touch (touch is routed to mouse; button 0=left, 1=right, 2=middle)
mousePos             // World space cursor
mousePosScreen       // Screen space cursor
mouseWheel           // Wheel delta this frame
mouseIsDown(button)  // Button down?
mouseWasPressed(button) / mouseWasReleased(button)

// Most recently used device (sticky while idle)
lastInputDevice      // 'mouse' | 'keyboard' | 'gamepad'
usingMouseInput() / usingKeyboardInput() / usingGamepadInput()

// Gamepad
gamepadIsDown(button, gamepad=0)
gamepadWasPressed(button, gamepad=0) / gamepadWasReleased(button, gamepad=0)
gamepadStick(stickIndex, gamepad=0)  // Analog stick as a vec2 (movement / aim)

// Settings
gamepadsEnable = true               // Allow gamepads?
inputWASDEmulateDirection = true    // Route WASD to arrow keys?
touchGamepadEnable = false          // Show on-screen gamepad on mobile?
```

## Object System (EngineObject)

Top-level engine class. Auto-adds itself to the object list; updates and renders every frame.
With no `tileInfo` it draws as a colored box - override `render()` to draw a circle/polygon/etc.

```javascript
EngineObject(pos, size=(1,1), tileInfo, angle=0, color, renderOrder=0) // tileInfo undefined = colored box
o.update()                         // Override for per-frame logic (engine applies physics automatically)
o.render()                         // Override for custom drawing
o.destroy()                        // Destroy this object and its children
o.collideWithTile(tileData, pos)   // Override: react to tile collision
o.collideWithObject(object)        // Override: react to object collision
o.getAliveTime()                   // Seconds since created
o.applyForce(force) / o.applyAcceleration(acceleration)
o.addChild(child, localPos, localAngle) / o.removeChild(child)
o.setCollision(solids, isSolid, tiles) // Enable collision

// Members
o.pos o.size o.drawSize o.tileInfo o.angle o.color o.additiveColor o.mirror
o.mass             // 0 = static (immovable)
o.damping          // Velocity retained each frame (0-1)
o.angleDamping     // Angular velocity retained each frame (0-1)
o.restitution      // Bounciness (0-1)
o.friction         // Friction when sliding (0-1)
o.gravityScale     // Gravity multiplier
o.renderOrder      // Draw sort order
o.velocity         // Velocity vector
o.angleVelocity    // Angular velocity (NOTE: angleVelocity, not "angularVelocity")

// Settings
enablePhysicsSolver = true   // Collisions between objects?
objectDefaultDamping = 1     // Default velocity damping (1 = none)
objectDefaultRestitution = 0 // Default bounciness
objectDefaultFriction = .8   // Default friction
gravity = (0,0)              // World gravity (set y negative to fall down)

// Queries
engineObjectsCollect(pos, size, objects=engineObjects)  // Objects in an area
engineObjectsCallback(pos, size, callbackFunction)      // Run callback over objects in area
engineObjectsRaycast(start, end)                        // Objects along a ray
```

## Tile Collision (for platformers / grid games)

Use a collision layer for solid tiles; draw the visible tiles yourself with `drawRect` etc.

```javascript
TileCollisionLayer(pos, size, tileInfo=tile())  // Create a collision layer
layer.setCollisionData(pos, data=1)             // Set collision at a tile (0 = empty)
tileCollisionGetData(pos)                        // Read collision data at a tile
tileCollisionTest(pos, size=(0,0), object)       // Would this overlap a solid tile?
tileCollisionRaycast(posStart, posEnd, object)   // Center of first solid tile hit
// In an EngineObject, react via: collideWithTile(tileData, pos) { ... }
```

## Particle System

```javascript
ParticleEmitter(pos, angle, ...settings) // Create a particle system (pass undefined tile for square particles)
emitter.emitParticle()                   // Spawn one particle manually
particleEmitRateScale = 1                // Global emit rate scale

// Constructor arg order:
// pos, angle, emitSize, emitTime, emitRate, coneAngle, tileInfo,
// colorStartA, colorStartB, colorEndA, colorEndB,        // end colors use alpha 0 to fade out
// particleTime, sizeStart, sizeEnd, speed,               // speed is per-FRAME (small values like .15)
// angleSpeed, damping, angleDamping, gravityScale, particleConeAngle,
// fadeRate, randomness, collideTiles, additive, ...
```

## Tween System

Animate numbers, Vector2, Color, or any value with a `.lerp(other, percent)` method. Auto-registers.

```javascript
tweenProperty(target, propertyPath, start, end, duration=1, options) // Tween a property by dot-path
new Tween(callback, start=0, end=1, duration=1, options)             // Tween via callback
tween.setEase(easeFn) / tween.then(callback)
tween.loop(count=Infinity) / tween.pingPong(count=Infinity)
tween.pause() / tween.resume() / tween.restart() / tween.stop()
tween.getValue() / tween.getPercent()

// Easing curves: Ease.LINEAR SINE CIRC EXPO BACK ELASTIC SPRING BOUNCE
// Modifiers: Ease.OUT(curve)  Ease.IN_OUT(curve)
tweenStopAll() // Stop every active tween (e.g. on reset)
```

## Box2D Physics (optional - use the indexBox2d.html starter)

```javascript
// Setup (in gameInit, before creating bodies)
await box2dInit()              // Loads the WASM and creates global box2d
box2d.setGravity(vec2(0,-20))  // World gravity (note: counterclockwise is positive in Box2D)

// Bodies extend EngineObject
new Box2dObject(pos, size, tileInfo, angle, color, bodyType)  // Dynamic by default
new Box2dStaticObject(pos, size, tileInfo, angle, color)      // Immovable
new Box2dKinematicObject(pos, size, tileInfo, angle, color)   // Moves, ignores forces

// Add shapes (call from constructor or after creation)
obj.addBox(size, offset, angle, density, friction, restitution, isSensor)
obj.addCircle(diameter, offset, density, friction, restitution, isSensor)
obj.addPoly(points, offset, angle, density, friction, restitution, isSensor)
obj.addRandomPoly(diameter)   // Quick random convex polygon

// Forces and motion
obj.applyForce(force, pos) / obj.applyImpulse(impulse, pos)
obj.applyTorque(torque) / obj.setLinearVelocity(vel) / obj.setAngularVelocity(av)

// Raycasting
box2d.raycast(startPos, endPos, filterCallback?)  // Box2dRaycastResult or undefined
box2d.pointCast(pos)                               // Object at a point (for mouse grabbing)

// Joints (extend Box2dJoint)
new Box2dTargetJoint(object, targetPos)            // Drag toward a point (mouse follow)
new Box2dRevoluteJoint(objectA, objectB, anchor)   // Pin/hinge
new Box2dDistanceJoint(objectA, objectB, anchorA, anchorB)
new Box2dWeldJoint(objectA, objectB, anchor)
new Box2dWheelJoint(objectA, objectB, anchor, axis)
```

## Debugging

```javascript
ASSERT(assert, output)                                  // Throw if expression is false
debugRect(pos, size, color='#fff', time=0, angle=0)     // Draw debug rectangle
debugCircle(pos, size, color='#fff', time=0)            // Draw debug circle
debugLine(posA, posB, color, width=.1, time)            // Draw debug line
debugText(text, pos, size=1, color='#fff', time=0)      // Draw debug text
// Press Escape in a debug build to toggle the debug overlay.
```

[LittleJS Engine](https://github.com/KilledByAPixel/LittleJS) Copyright 2021 Frank Force
