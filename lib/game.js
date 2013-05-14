var wave = 1,
    playerX,
    playerY,
    entities = [],
    canvas = document.getElementById("canvas"),
    context = canvas.getContext("2d");

// handles keyboard events
var Keyboard = (function (el) {
    
    var k = {};

    function listen(el, e, l) {
        return el.addEventListener(e, l, false);
    }

    listen(el, "keydown", function (e) {
        k[e.keyCode] = true;
    });
    
    listen(el, "keyup", function (e) {
        delete k[e.keyCode];
    });

    return {
        isKeyDown: function (key) {
            return k.hasOwnProperty(key);
        }
    };

} (window));

// convenience functions mostly for collision
var Geometry = {
    triangle: {
        // ((CxBy - BxCy) - (CxAy - AxCy) + (BxAy - AxBy)) / 2
        area: function (a, b, c) {
            return (((c[0] * b[1]) - (b[0] * c[1])) - 
                ((c[0] * a[1]) - (a[0] * c[1])) + 
                ((b[0] * a[1]) - (a[0] * b[1]))) / 2;
        }
    },
    square: {
        contains: function (points, point) {
            var a,
                b,
                c,
                d,
                area = Geometry.triangle.area; // cache for performance

            return !(area((a = bounds[0]), (b = bounds[1]), point) > 0
                || area(b, (c = bounds[2]), point) > 0
                || area(c, (d = bounds[3]), point) > 0
                || area(d, a, point) > 0);
        }
    }
};

// this is the game loop
function game(update, draw, delta) {
    var shouldStop = false;
    
    delta = delta || 1000 / 60; // time to elapse between ticks before update
    gameTime = accumulator = 0; // running clock for calculating updates
    startTime = lastTime = Date.now(); // set the start time of the game to now
    
    requestAnimationFrame(function step(time) {
        var frameTime = Date.now();
        
        accumulator += (frameTime - lastTime);
        lastTime = frameTime;
        
        // iterate as long as enough real time has elapsed between the
        // last tick and the current tick to accomodate an update
        while (accumulator >= delta) {
            update(delta, (gameTime += delta));
            accumulator -= delta;
        }
        
        // always draw no matter what, but do so after updates
        // todo: lerp
        draw();

        // check if we have been signaled to stop
        // the game and continue if we haven't
        if (!shouldStop) {
            requestAnimationFrame(step);
        }
    });

    // promise
    return {
        stop: function () {
            shouldStop = true;
        }
    };
}

// every tick of the game loop this method is called
// it will empty the current canvas, and render each
// entity (player or enemy) in the game
function draw() {
    canvas.width = canvas.width;
    entities.forEach(function (entity, index) {
        entity.draw(context, entity, index);
    });
}

// every tick of the game loop this method is called
// it will update the each entity (player or enemy) in the game
function update(dt, gt) {
    entities.forEach(function (entity, index) {
        entity.update(dt, gt, entity, index);
    });
}

// returns a bullet entity
function bullet(options) {
    var x,
        y,
        vx,
        vy,
        radius = 0.5,
        speed = 0.3;

    options = options || {};
    x = options.x || 0;
    y = options.y || 0;
    vx = options.vx || 0;
    vy = options.vy || 0;
    squareContains = Geometry.square.contains;

    return {
        type: "bullet",
        update: function (dt, gt, _, index) {
            var coords,
                didCollide,
                dx = vx * speed * dt,
                dy = vy * speed * dt;

            // the bullet is out of bounds and should be removed
            if (x > 640 || x < 0 || y < 0 || y > 360) {
                entities.splice(index, 1);
            }

            // update and cache the coordinates
            coords = [x += dx, y += dy];

            // check for collision with entities
            didCollide = entities.some(function (entity, i) {
                // if this entity is not a survivor then skip it
                if (entity.type === 'survivor' && squareContains(entity.points(), coords)) {
                    // we collided and need to slay the survivor
                    entities.splice(i, 1);
                    return true;
                }
            });

            // if we collided then we need to remove ourselves
            if (didCollide) {
                entities.splice(index, 1);
            }
        },
        draw: function (context) {
            context.beginPath();
            context.arc(x, y, radius, 0, 2 * Math.PI, false);
            context.stroke();
        }
    };
}

// returns a survivor entity
function survivor(options) {
    var x,
        y,
        width,
        height,
        player;

    options = options || {};
    x = options.x || 0;
    y = options.y || 0;
    width = options.width || 10;
    height = options.height || 10;

    return {
        x: function () {
            return x;
        },
        y: function () {
            return y;
        },
        w: function () {
            return width;
        },
        points: function () {
            return [
                [x, y],
                [x + width, y],
                [x + width, y + height],
                [x, y + height]
            ];
        },
        type: "survivor",
        update: function (dt, gt) {
            var dx = Math.abs(playerX - x),
                dy = Math.abs(playerY - y),
                sx = (x < playerX) ? 1 : -1,
                sy = (y < playerY) ? 1 : -1,
                err = playerX - playerY,
                err2 = 2 * err;

            if (x == playerX && y == playerY) {
                // game over
                return;
            }

            if (err2 > playerY * -1) {
                err -= playerY;
                x += sx * 1.3;
            }

            if (err2 < playerX) {
                err += playerX;
                y += sy * 1.3;
            }
        },
        draw: function (context) {
            context.beginPath();
            context.rect(x, y, width, height);
            context.fillStyle = "yellow";
            context.fill();
            context.stroke();
        }
    }
}

// returns a player entity
function player(options) {
    options = options || {};

    var lastFireTime = 0,
        speed = 0.15,
        x = options.x || 0,
        y = options.y || 0,
        width = 10,
        height = 10,
        rateOfFire = options.rateOfFire || (1000 / 60) * 20;

    return {
        type: "player",
        update: function (dt, gt) {
            var velocity,
                orientation;

            // this determines which direction the player
            // is facing based on key press
            // expressed as a vector [x, y]
            orientation = [(function (kb) {
                if (kb.isKeyDown(65)) {
                    return -1;
                } else if (kb.isKeyDown(68)) {
                    return 1;
                } else {
                    return 0;
                }
            } (Keyboard)), (function (kb) {
                if (kb.isKeyDown(87)) {
                    return -1;
                } else if (kb.isKeyDown(83)) {
                    return 1;
                } else {
                    return 0;
                }
            } (Keyboard))];

            // velocity vectory is expressed as
            // [Ox * speed * dt, Oy * speed * dt]
            velocity = orientation.map(function (o) {
                return o * speed * (dt)
            });

            x += velocity[0];
            y += velocity[1];

            playerX = x;
            playerY = y;

            // determines if a bullet can be fired and where
            // that bullet will go (relative the player)
            if (gt - lastFireTime > rateOfFire) {
                if (Keyboard.isKeyDown(38)) {
                    entities.push(bullet({
                        x: x,
                        y: y,
                        vy: -1
                    }));
                } else if (Keyboard.isKeyDown(39)) {
                    entities.push(bullet({
                        x: x,
                        y: y,
                        vx: 1
                    }));
                } else if (Keyboard.isKeyDown(40)) {
                    entities.push(bullet({
                        x: x,
                        y: y,
                        vy: 1
                    }));
                } else if (Keyboard.isKeyDown(37)) {
                    entities.push(bullet({
                        x: x,
                        y: y,
                        vx: -1
                    }));
                }

                lastFireTime = gt;
            }
        },
        draw: function (context) {
            context.beginPath();
            context.rect(x, y, width, height);
            context.stroke();
        }
    };
}

// this is a debugging entity that currently indicates
// the number of entities generated and alive in the game
function utils() {
    var ent = document.getElementById("entities");

    return {
        draw: function () {
            ent.innerHTML = entities.length - 1;
        },
        update: function () {

        }
    };
}

// add entities to the game
entities.push(utils());
entities.push(player());
// start the game
game(update, draw);

// spawn enemies every three seconds
// the global variable wave is used as a multiplier for difficulty
setInterval(function () {
    var angle,
        e = wave;
    while (--e >= 0) {
        // spawn an enemy randomly at a point on a circle
        // with center of player at time of spawn
        angle = 2 * Math.PI * Math.random();
        entities.push(survivor({
            x: playerX + 700 * Math.cos(angle),
            y: playerY + 700 * Math.sin(angle)
        }));
    }
    ++wave;
}, 1000 * 3);