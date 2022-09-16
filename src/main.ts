/***
 * Shulunsaina Xiao
 * 29569362
 */

import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

// Define type for key codes
type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'KeyR' | 'KeyN';
// Define the event we want to listen for
type Event = 'keydown';

const frogger = () => {

  // Define game constants
  const Constants = {
    CANVAS_HEIGHT: 750,
    CANVAS_WIDTH: 550,
    MOVABLE_RANGE: { left: 0, right: 500, top: 50, bottom: 650 },
    GRID_SIZE: 50,
    FLIES_LIMIT: 2,
    SNAKES_LIMIT: 2,
    START_TIME: 0,
    FROG_START_POSITION: new Vec(250, 650),
    TOLERANCE: 20,      // Tolerance for entering goal detection
    SPEED_FACTOR: 0.7   // Speed factor for vehicles and logs, used when level changes
  } as const

  // our game has the following view element types
  type ViewType = 'frog' | 'car' | 'truck' | 'log' | 'fly' | 'snake' | 'road' | 'water' | 'grass' | 'goal'

  class Tick { constructor(public readonly elapsed: number) { } }
  class Move { constructor(public readonly movement: Vec) { } }
  class Restart { constructor() { } }
  class NextLevel { constructor() { } }

  const
    // Define clock for the game (ticks every 10ms). FROM ASTEROIDS EXAMPLE. 
    gameClock = interval(10)
      .pipe(map(elapsed => new Tick(elapsed))),

    // Map events to game actions. FROM ASTEROIDS EXAMPLE.
    keyObservable = <T>(e: Event, k: Key, result: () => T) =>
      fromEvent<KeyboardEvent>(document, e)
        .pipe(
          filter(({ code }) => code === k),
          filter(({ repeat }) => !repeat),
          map(result)),

    // Different actions for the game based on different key pressed
    moveUp = keyObservable('keydown', 'ArrowUp', () => new Move(new Vec(0, -Constants.GRID_SIZE))),
    moveRight = keyObservable('keydown', 'ArrowRight', () => new Move(new Vec(Constants.GRID_SIZE, 0))),
    moveDown = keyObservable('keydown', 'ArrowDown', () => new Move((new Vec(0, Constants.GRID_SIZE)))),
    moveLeft = keyObservable('keydown', 'ArrowLeft', () => new Move(new Vec(-Constants.GRID_SIZE, 0))),
    restart = keyObservable('keydown', 'KeyR', () => new Restart()),
    nextLevel = keyObservable('keydown', 'KeyN', () => new NextLevel())

  type Rect = Readonly<{ position: Vec, size: Vec }>
  type ObjectId = Readonly<{ id: string, createTime: number }>

  // State for object
  interface IObject extends Rect, ObjectId {
    viewType: ViewType
  }

  // State for object that can move
  interface IMovableObject extends IObject {
    velocity: Vec,
    direction: number  // -1 = left, 1 = right
  }

  // State for object that can be visited
  interface ITarget extends IObject {
    visited: boolean
  }

  // State for text object
  interface IText {
    id: string,
    text: string,
    size: number,
    position: Vec,
    color: string
  }

  // Type declaration
  type Object = Readonly<IObject>
  type MovableObject = Readonly<IMovableObject>
  type TargetObject = ITarget         // not readonly because 'visited' can be updated
  type TextObject = Readonly<IText>


  // The Game state
  type GameState = Readonly<{
    time: number,
    road: Object,
    water: Object,
    grass: ReadonlyArray<Object>,
    goals: ReadonlyArray<TargetObject>,
    frog: MovableObject,
    vehicles: ReadonlyArray<MovableObject>,
    logs: ReadonlyArray<MovableObject>,
    flies: ReadonlyArray<MovableObject>,
    snakes: ReadonlyArray<MovableObject>,
    exit: ReadonlyArray<Object>,
    texts: ReadonlyArray<TextObject>,
    level: number,
    maxScore: number,
    score: number,
    gameWin: boolean,
    gameOver: boolean
  }>

  /*
   * Functions for creating objects.
   * Curried functions are used.
  */

  // Function for creating static objects
  const createObject = (viewType: ViewType) => (size: Vec) => (oid: ObjectId) => (pos: Vec) =>
    <Object>{
      ...oid,
      size: size,
      position: pos,
      viewType: viewType,
      // if the id is 0, it is the only object of this type, so the name is just viewType.
      // otherwise, append the id to the viewType to make the name unique.
      id: oid.id != '0' ? viewType + '-' + oid.id : viewType,
    }

  // Function for creating movable objects. Uses createObject function
  const createMovingObject = (viewType: ViewType) => (size: Vec) => (oid: ObjectId) => (pos: Vec) => (vel: Vec) => (dir: number) => (
    <MovableObject>{
      ...createObject(viewType)(size)(oid)(pos),
      velocity: vel,
      direction: dir
    }
  )

  // Function for creating target objects. Uses createObject function
  const createTargetObject = (viewType: ViewType) => (size: Vec) => (oid: ObjectId) => (pos: Vec) => (visited: boolean) => (
    <TargetObject>{
      ...createObject(viewType)(size)(oid)(pos),
      visited: visited
    }
  )

  // Function for creating text objects
  const createTextObject = (id: string) => (text: string) => (size: number) => (pos: Vec) => (color: string) => (
    <TextObject>{
      id: id,
      text: text,
      size: size,
      position: pos,
      color: color
    }
  )

  /*
   * More functions for creating objects.
   * Curried functions are used.
  */
  const
    // Create objects that have a height of 5 * GRID_SIZE. (road, water)
    createLand = (type: ViewType) =>
      createObject
        (type)
        (new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE))
        ({ id: '0', createTime: Constants.START_TIME }),


    // Create grass (safe zone) objects
    createGrass = (id: string) =>
      createObject
        ('grass')
        (new Vec(Constants.CANVAS_WIDTH, Constants.GRID_SIZE))
        ({ id: id, createTime: Constants.START_TIME }),


    // Create movable objects that have a height of 1 * GRID_SIZE. (frog, car, truck, log)
    createGridHeightObj = (type: ViewType) => (len: number) => (id: string) =>
      createMovingObject
        (type)
        (new Vec(len * Constants.GRID_SIZE, Constants.GRID_SIZE))
        ({ id: id, createTime: Constants.START_TIME }),

    // Create objects that has scaled height and width (fly, snake)
    createScaledObj = (type: ViewType) => (scaleX: number) => (scaleY: number) => (oid: ObjectId) =>
      createMovingObject
        (type)
        (new Vec(Constants.GRID_SIZE / scaleX, Constants.GRID_SIZE / scaleY))
        (oid),

    // Create goal objects
    createGoal = (id: string) =>
      createTargetObject
        ('goal')
        (new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))
        ({ id: id, createTime: Constants.START_TIME }),


    createRoad = createLand('road')(new Vec(0, 400)),
    createWater = createLand('water')(new Vec(0, 100)),

    createFrog = createGridHeightObj('frog')(1)('0')(Constants.FROG_START_POSITION)(Vec.Zero)(1),
    createCar = createGridHeightObj('car')(1),
    createTruck = createGridHeightObj('truck')(2),
    createLog = (len: number) => createGridHeightObj('log')(len),

    createFly = (oid: ObjectId) => createScaledObj('fly')(5)(5)(oid),
    createSnake = (oid: ObjectId) => createScaledObj('snake')(2)(5)(oid)

  // Create a random fly using RNG class
  function createRandomFly(time: number): MovableObject {
    const
      r1 = new RNG(time),
      r2 = r1.next(),
      r3 = r2.next(),
      r4 = r3.next(),
      r5 = r4.next(),
      rngs = [r1, r2, r3, r4, r5],
      randomFloats = rngs.map(r => r.float()),
      fly = createFly
        ({ id: String(time), createTime: time })
        (new Vec(randomFloats[0] * Constants.CANVAS_WIDTH, randomFloats[1] * (Constants.CANVAS_HEIGHT - 100)))
        (new Vec(randomFloats[2], randomFloats[3]))
        (randomFloats[4] > 0.5 ? 1 : -1)
    return fly;
  }

  // Create a random snake using RNG class. The snake is created on the given log
  function createRandomSnake(time: number, l: MovableObject) {
    const
      r1 = new RNG(time),
      r2 = r1.next(),
      randomPositionOnLog = new Vec(r1.float() * l.size.x / 2, r2.float() * 100 * l.size.y),
      snake = createSnake
        ({ id: String(time), createTime: time })
        (l.position.add(randomPositionOnLog))
        (l.velocity)
        (l.direction)
    console.log(r2.float())
    return snake;
  }

  // Create goals based on level
  function initialGoals(lvl: number): ReadonlyArray<TargetObject> {
    if (lvl < 2) {
      return [
        createGoal('3')(new Vec(5 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false)
      ] as ReadonlyArray<TargetObject>
    }
    if (lvl < 4) {
      return [
        createGoal('1')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
        createGoal('3')(new Vec(5 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
        createGoal('5')(new Vec(9 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),

      ] as ReadonlyArray<TargetObject>
    }
    else {
      return [
        createGoal('1')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
        createGoal('2')(new Vec(3 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
        createGoal('3')(new Vec(5 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
        createGoal('4')(new Vec(7 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
        createGoal('5')(new Vec(9 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      ] as ReadonlyArray<TargetObject>
    }
  }

  const
    gameOverTexts = [
      createTextObject('game-over')('GAME OVER')(100)(new Vec(50, 400))('blue'),
      createTextObject('retry')('PRESS  [R]  TO  RETRY')(30)(new Vec(160, 450))('blue')
    ] as ReadonlyArray<TextObject>,

    nextLevelTexts = [
      createTextObject('lvl-complete')('LEVEL COMPLETE')(70)(new Vec(25, 400))('blue'),
      createTextObject('next')('PRESS [N] FOR NEXT LVL')(30)(new Vec(130, 450))('blue')
    ] as ReadonlyArray<TextObject>,

    // Create grass (safe zone)
    initialGrass = [
      createGrass('1')(new Vec(0, 650)),
      createGrass('2')(new Vec(0, 350)),
    ] as ReadonlyArray<Object>,

    // Create initial vehicles. The vehicles have speeds based on level
    initialVehicles = (lvl: number) => [
      createCar('1')(new Vec(Constants.CANVAS_WIDTH, 400))(new Vec(3, 0).mult(lvl * Constants.SPEED_FACTOR))(-1),
      createCar('2')(new Vec(Constants.CANVAS_WIDTH, 450))(new Vec(2, 0).mult(lvl * Constants.SPEED_FACTOR))(-1),
      createCar('3')(new Vec(Constants.CANVAS_WIDTH, 600))(new Vec(1, 0).mult(lvl * Constants.SPEED_FACTOR))(1),

      createTruck('1')(new Vec(Constants.CANVAS_WIDTH, 500))(new Vec(1, 0).mult(lvl * Constants.SPEED_FACTOR))(1),
      createTruck('2')(new Vec(Constants.CANVAS_WIDTH + 3 * Constants.GRID_SIZE, 600))(new Vec(1, 0).mult(lvl))(1)
    ] as ReadonlyArray<MovableObject>,

    // Create initial logs. The vehicles have speeds based on level
    initialLogs = (lvl: number) => [
      createLog(3)('1')(new Vec(0, 300))(new Vec(2, 0).mult(lvl * Constants.SPEED_FACTOR))(1),
      createLog(4)('2')(new Vec(Constants.CANVAS_WIDTH + 50, 250))(new Vec(0.5, 0).mult(lvl * Constants.SPEED_FACTOR))(-1),
      createLog(3)('3')(new Vec(Constants.CANVAS_WIDTH + 200, 200))(new Vec(1, 0).mult(lvl * Constants.SPEED_FACTOR))(1),
      createLog(4)('4')(new Vec(Constants.CANVAS_WIDTH + 50, 150))(new Vec(1.1, 0).mult(lvl * Constants.SPEED_FACTOR))(1),
      createLog(6)('5')(new Vec(0, 100))(new Vec(0.5, 0).mult(lvl))(-1)
    ] as ReadonlyArray<MovableObject>,


    // Create initial game state
    createInitialState = (lvl: number, sc: number, maxSc: number) => {
      return <GameState>{
        time: 0,
        road: createRoad,
        water: createWater,
        grass: initialGrass,
        goals: initialGoals(lvl),
        frog: createFrog,
        vehicles: initialVehicles(lvl),
        logs: initialLogs(lvl),
        flies: [],
        snakes: [],
        exit: [],
        texts: [],
        level: lvl,
        score: sc,
        maxScore: maxSc,
        gameWin: false,
        gameOver: false
      }
    },

    // Wrap positions around horizontally
    torusWrap = (pos: Vec, size: Vec) => {
      function wrap(x: number) {
        if (x < -size.x) return x + Constants.CANVAS_WIDTH + size.x
        if (x > Constants.CANVAS_WIDTH) return x - Constants.CANVAS_WIDTH - size.x
        return x
      }
      return new Vec(wrap(pos.x), pos.y)
    },


    moveObject = (o: MovableObject) => {
      return <MovableObject>{
        ...o,
        position: torusWrap(o.position.add(o.velocity.mult(o.direction)), o.size)
      }
    },

    // Frog is considered on object if more than half of it is on the object
    objectsOverlapped = (objA: Object, objB: Object) => {
      const xOverlapped = objA.position.x + objA.size.x / 2 > objB.position.x && objA.position.x + objA.size.x / 2 <= objB.position.x + objB.size.x
      const yOverlapped = objA.position.y + objA.size.y / 2 > objB.position.y && objA.position.y + objA.size.y <= objB.position.y + objB.size.y
      return xOverlapped && yOverlapped
    },

    objectsCollided = (objA: Object, objB: Object) => {
      return objA.position.x + objA.size.x > objB.position.x && objA.position.x < objB.position.x + objB.size.x &&
        objA.position.y + objA.size.y > objB.position.y && objA.position.y < objB.position.y + objB.size.y
    },



    handleCollisions = (s: GameState) => {
      const
        // function that removes movable objects from array
        remove = except((a: MovableObject) => (b: MovableObject) => a.id === b.id),

        // if more than half of the frog falls outside the canvas, it's dead
        frogOffCanvas = s.frog.position.x < -s.frog.size.x / 2 || s.frog.position.x > Constants.CANVAS_WIDTH - s.frog.size.x / 2,
        frogCollidedWithVehicle = s.vehicles.filter(r => objectsCollided(s.frog, r)).length > 0,
        frogCollidedWithSnake = s.snakes.filter(r => objectsCollided(s.frog, r)).length > 0,
        frogInWater = s.frog.position.y < s.water.position.y + s.water.size.y && s.frog.position.y + s.frog.size.x > s.water.position.y,
        frogOnLog = s.logs.filter(r => objectsOverlapped(s.frog, r)).length > 0,
        logFrogIsOn = s.logs.filter(r => objectsOverlapped(s.frog, r))[0],
        fliesCollided = s.flies.filter(r => objectsCollided(s.frog, r)),

        frogOnGoal = s.goals.filter(r => r.visited !== true).filter(r => objectsOverlapped(s.frog, r)).length > 0,
        goalVisited = s.goals.filter(r => objectsOverlapped(s.frog, r))[0],   // the goal that the frog is on
        newGoals = frogOnGoal ? s.goals.map(g => g.id === goalVisited.id ? { ...g, visited: true } : { ...g }) : s.goals,

        score = s.score + fliesCollided.length * 10 + (frogOnGoal ? 100 : 0),
        gameOver = frogOffCanvas || frogCollidedWithVehicle || frogCollidedWithSnake || (frogInWater && !frogOnLog),
        gameWin = newGoals.filter(g => g.visited === true).length === s.goals.length,

        GameWinText = gameWin ? s.texts.concat(nextLevelTexts) : s.texts,

        // for each snake, check if the number of logs it is on is equals to zero. 
        // If so, it means that the snake is not on any log and it should be removed from the game
        snakesNotOnLog = s.snakes.filter(snake => s.logs.filter(log => objectsCollided(log, snake)).length == 0)

      return <GameState>{
        ...s,
        frog: {
          ...s.frog,
          // if frog is on log, move with the log it is on
          velocity: frogOnLog ? logFrogIsOn.velocity.mult(logFrogIsOn.direction) : Vec.Zero,
          // if frog is on goal, reset its position
          position: frogOnGoal ? Constants.FROG_START_POSITION : s.frog.position
        },
        flies: remove(s.flies)(fliesCollided),
        snakes: remove(s.snakes)(snakesNotOnLog),
        exit: s.exit.concat(fliesCollided).concat(snakesNotOnLog).concat(gameWin ? s.goals : []).concat(gameOver ? s.goals : []),
        goals: newGoals,
        texts: GameWinText.concat(gameOver ? gameOverTexts : []),
        score: score,
        maxScore: Math.max(score, s.maxScore),
        gameWin: gameWin,
        level: gameWin ? s.level + 1 : s.level,
        gameOver: gameOver
      }
    },

    // Create random flies based on game state
    randomFly = (s: GameState, elapsed: number) => {
      const
        flyExpired = (o: Object) => (elapsed - o.createTime) > 500 || o.position.y + o.size.y > Constants.CANVAS_HEIGHT - 50 || o.position.y <= 100,
        activeFlies = s.flies.filter(o => !flyExpired(o)),
        needFlies = activeFlies.length < Constants.FLIES_LIMIT

      if (needFlies) {
        const
          r1 = new RNG(elapsed),
          newFlies = r1.float() < 0.005 ? activeFlies.concat(createRandomFly(elapsed)) : activeFlies
        return newFlies
      }
      return activeFlies
    },

    // Create random snakes based on game state
    randomSnake = (s: GameState, elapsed: number) => {
      const snakeExpired = (o: Object) => (elapsed - o.createTime) > 500 || o.position.x + o.size.x / 2 > Constants.CANVAS_WIDTH,
        activeSnakes = s.snakes.filter(o => !snakeExpired(o)),
        needSnakes = activeSnakes.length < Constants.SNAKES_LIMIT

      if (needSnakes) {
        const
          r1 = new RNG(elapsed),
          r2 = r1.next(),
          randomLog = s.logs[Math.floor(r1.float() * s.logs.length)],
          newSnakes = r2.float() < 0.005 ? activeSnakes.concat(createRandomSnake(elapsed, randomLog)) : activeSnakes
        return newSnakes
      }
      return activeSnakes
    },

    // function accounts for elapsed time
    tick = (s: GameState, elapsed: number) => {
      const
        flyExpired = (o: Object) => (elapsed - o.createTime) > 500 || o.position.y + o.size.y > Constants.CANVAS_HEIGHT - 50 || o.position.y <= 100,
        expiredFlies: ReadonlyArray<MovableObject> = s.flies.filter(flyExpired),
        snakeExpired = (o: Object) => (elapsed - o.createTime) > 500 || o.position.x + o.size.x / 2 > Constants.CANVAS_WIDTH,
        expiredSnakes: ReadonlyArray<MovableObject> = s.snakes.filter(snakeExpired)

      if (s.gameOver || s.gameWin) {
        return s  //freeze the game
      }

      else {
        return handleCollisions({
          ...s,
          time: s.time + elapsed,
          frog: moveObject(s.frog),
          vehicles: s.vehicles.map(moveObject),
          logs: s.logs.map(moveObject),
          exit: expiredFlies.concat(expiredSnakes),
          flies: randomFly(s, elapsed).map(moveObject),
          snakes: randomSnake(s, elapsed).map(moveObject)
        })
      }
    },


    /***
     * Check the bounds for moving objects
     */
    checkBounds = (s: GameState, o: MovableObject, e: Move): Vec => {
      if (!s.gameOver && !s.gameWin) {
        const
          newPos = o.position.add(e.movement),
          unvisitedGoals = s.goals.filter(g => g.visited === false),
          unvisitedGoalsPositions = unvisitedGoals.map(g => g.position)

        // if movement left is not enough for a full grid, move frog to the edge of the canvas
        if (newPos.x < Constants.MOVABLE_RANGE.left) {
          return new Vec(Constants.MOVABLE_RANGE.left, o.position.y)
        }
        if (newPos.x > Constants.MOVABLE_RANGE.right) {
          return new Vec(Constants.MOVABLE_RANGE.right, o.position.y)
        }
        if (newPos.y < Constants.MOVABLE_RANGE.top) {
          return new Vec(o.position.x, Constants.MOVABLE_RANGE.top)
        }
        if (newPos.y > Constants.MOVABLE_RANGE.bottom) {
          return new Vec(o.position.x, Constants.MOVABLE_RANGE.bottom)
        }

        // if frog is going to the goal section but landing on a visited goal, don't move
        if (newPos.y < Constants.MOVABLE_RANGE.top + Constants.GRID_SIZE && !unvisitedGoalsPositions.some(p => newPos.overlaps(p)(Constants.TOLERANCE))) {
          return o.position
        }

        return newPos;
      }
      return o.position
    },


    // Reduce the game state based on the event
    reduceState = (s: GameState, e: NextLevel | Restart | Move | Tick): GameState =>
      e instanceof NextLevel ? createInitialState(s.level, s.score, s.maxScore) :
        e instanceof Restart ? createInitialState(1, 0, s.maxScore)
          : e instanceof Move ? { ...s, frog: { ...s.frog, position: checkBounds(s, s.frog, e) } }
            : tick(s, e.elapsed)

  const subscription = merge(gameClock, nextLevel, restart, moveUp, moveRight, moveDown, moveLeft).pipe(scan(reduceState, createInitialState(1, 0, 0))).subscribe(updateView)

  // Update the view based on the game state
  function updateView(s: GameState) {
    const
      canvas = document.getElementById("svgCanvas")!,
      updateObjectView = (o: Object) => {
        const v = document.getElementById(o.id) || document.createElementNS(canvas.namespaceURI, 'rect')!;
        attr(v, { id: o.id, x: o.position.x, y: o.position.y, width: o.size.x, height: o.size.y })
        v.classList.add(o.viewType);

        canvas.appendChild(v);
      },

      updateTextObjectView = (o: TextObject) => {
        const v = document.getElementById(o.id) || document.createElementNS(canvas.namespaceURI, 'text')!;
        attr(v, { id: o.id, x: o.position.x, y: o.position.y, 'font-size': o.size, fill: o.color })
        v.classList.add('text');
        v.textContent = o.text;
        canvas.appendChild(v);
      },

      updateTargetObjectView = (o: TargetObject) => {
        const v = document.getElementById(o.id);
        if (v) {
          if (o.visited) {
            v.classList.add('visited');
          }
        }
      }

    // update score, level and highest score
    const score = document.getElementById("score")!;
    score.textContent = String(s.score);
    const level = document.getElementById("level")!;
    level.textContent = String(s.level);
    const maxScore = document.getElementById("maxScore")!;
    maxScore.textContent = String(s.maxScore);

    // update all object views
    updateObjectView(s.road);
    updateObjectView(s.water);
    s.grass.forEach(updateObjectView);

    s.vehicles.forEach(updateObjectView);
    s.logs.forEach(updateObjectView);
    s.flies.forEach(updateObjectView);
    s.goals.forEach(updateObjectView);
    s.goals.filter(g => g.visited).forEach(updateTargetObjectView);

    updateObjectView(s.frog);
    s.snakes.forEach(updateObjectView)


    // remove exited objects
    s.exit.map(o => document.getElementById(o.id))
      .filter(isNotNullOrUndefined)
      .forEach(v => canvas.removeChild(v))

    // if game finished, display the texts
    if (s.gameWin || s.gameOver) {
      s.texts.forEach(updateTextObjectView);
    }

  }
}

/**
   * Utility functions (modified FROM ASTEROIDS EXAMPLE & FRP TUTE)
   */
class RNG {
  // LCG using GCC's constants
  readonly m = 0x80000000; // 2**31
  readonly a = 1103515245;
  readonly c = 12345;
  constructor(readonly state: number) { }
  int() {
    return (this.a * this.state + this.c) % this.m
  }
  float() {
    // returns in range [0,1]
    return this.int() / (this.m - 1);
  }
  next() {
    return new RNG(this.int());
  }
}

class Vec {
  constructor(public readonly x: number = 0, public readonly y: number = 0) { }
  add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b: Vec) => new Vec(this.x - b.x, this.y - b.y)
  len = () => Math.sqrt(this.x * this.x + this.y * this.y)
  mult = (s: number) => new Vec(this.x * s, this.y * s)
  overlaps = (b: Vec) => (tolerance: number) => this.x - b.x >= -tolerance && this.x - b.x <= tolerance
  static Zero = new Vec();
}

const
  /**
   * Composable not: invert boolean result of given function
   * @param f a function returning boolean
   * @param x the value that will be tested with f
   */
  not = <T>(f: (x: T) => boolean) => (x: T) => !f(x),
  /**
   * is e an element of a using the eq function to test equality?
   * @param eq equality test function for two Ts
   * @param a an array that will be searched
   * @param e an element to search a for
   */
  elem =
    <T>(eq: (_: T) => (_: T) => boolean) =>
      (a: ReadonlyArray<T>) =>
        (e: T) => a.findIndex(eq(e)) >= 0,
  /**
   * array a except anything in b
   * @param eq equality test function for two Ts
   * @param a array to be filtered
   * @param b array of elements to be filtered out of a
   */
  except =
    <T>(eq: (_: T) => (_: T) => boolean) =>
      (a: ReadonlyArray<T>) =>
        (b: ReadonlyArray<T>) => a.filter(not(elem(eq)(b))),
  /**
   * set a number of attributes on an Element at once
   * @param e the Element
   * @param o a property bag
   */
  attr = (e: Element, o: { [key: string]: unknown }) => { for (const k in o) e.setAttribute(k, String(o[k])) }


/**
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
  return input != null;
}


// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    frogger();
  };
}