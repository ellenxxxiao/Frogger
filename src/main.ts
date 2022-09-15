import "./style.css";
import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type Event = 'keydown' | 'keyup';

function main() {

  const Constants = {
    CANVAS_HEIGHT: 750,
    CANVAS_WIDTH: 550,
    MOVABLE_RANGE: { left: 0, right: 500, top: 50, bottom: 650 },
    GRID_SIZE: 50,
    FLIES_LIMIT: 2,
    START_TIME: 0,
    // FROG_START_POSITION: new Vec(250, 650),
    FROG_START_POSITION: new Vec(250, 350),
    TOLERANCE: 20
  } as const

  // our game has the following view element types
  type ViewType = 'frog' | 'car' | 'truck' | 'log' | 'fly' | 'road' | 'water' | 'grass' | 'goal'

  class Tick { constructor(public readonly elapsed: number) { } }
  class Move { constructor(public readonly movement: Vec) { } }

  const
    gameClock = interval(10)
      .pipe(map(elapsed => new Tick(elapsed))),

    keyObservable = <T>(e: Event, k: Key, result: () => T) =>
      fromEvent<KeyboardEvent>(document, e)
        .pipe(
          filter(({ code }) => code === k),
          filter(({ repeat }) => !repeat),
          map(result)),

    moveUp = keyObservable('keydown', 'ArrowUp', () => new Move(new Vec(0, -Constants.GRID_SIZE))),
    moveRight = keyObservable('keydown', 'ArrowRight', () => new Move(new Vec(Constants.GRID_SIZE, 0))),
    moveDown = keyObservable('keydown', 'ArrowDown', () => new Move((new Vec(0, Constants.GRID_SIZE)))),
    moveLeft = keyObservable('keydown', 'ArrowLeft', () => new Move(new Vec(-Constants.GRID_SIZE, 0)))

  type Rect = Readonly<{ position: Vec, size: Vec }>
  type ObjectId = Readonly<{ id: string, createTime: number }>

  // state for object
  interface IObject extends Rect, ObjectId {
    viewType: ViewType
  }

  // state for object that can move
  interface IMovableObject extends IObject {
    velocity: Vec,
    direction: number  // -1 = left, 1 = right
  }

  // state for object that can be visited
  interface ITarget extends IObject {
    visited: boolean
  }

  // state for text object
  interface IText {
    id: string,
    text: string,
    size: number,
    position: Vec,
    color: string
  }

  type Object = Readonly<IObject>
  type MovableObject = Readonly<IMovableObject>
  type TargetObject = ITarget // not readonly because 'visited' can be updated
  type TextObject = Readonly<IText>


  // Game state
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
    exit: ReadonlyArray<MovableObject>,
    texts: ReadonlyArray<TextObject>,
    score: number,
    gameOver: boolean
  }>

  const createObject = (viewType: ViewType) => (size: Vec) => (oid: ObjectId) => (pos: Vec) =>
    <Object>{
      ...oid,
      size: size,
      position: pos,
      viewType: viewType,
      id: oid.id != '0' ? viewType + '-' + oid.id : viewType,
    }

  const createMovingObject = (viewType: ViewType) => (size: Vec) => (oid: ObjectId) => (pos: Vec) => (vel: Vec) => (dir: number) => (
    <MovableObject>{
      ...createObject(viewType)(size)(oid)(pos),
      velocity: vel,
      direction: dir
    }
  )

  const createTargetObject = (viewType: ViewType) => (size: Vec) => (oid: ObjectId) => (pos: Vec) => (visited: boolean) => (
    <TargetObject>{
      ...createObject(viewType)(size)(oid)(pos),
      visited: visited
    }
  )

  const createTextObject = (id: string) => (text: string) => (size: number) => (pos: Vec) => (color: string) => (
    <TextObject>{
      id: id,
      text: text,
      size: size,
      position: pos,
      color: color
    }
  )

  const
    defaultOid = { id: '0', createTime: Constants.START_TIME },
    createGrass = (id: string) => createObject('grass')(new Vec(Constants.CANVAS_WIDTH, Constants.GRID_SIZE))({ id: id, createTime: Constants.START_TIME }),
    createRoad = createObject('road')(new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE))(defaultOid)(new Vec(0, 400)),
    createWater = createObject('water')(new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE))(defaultOid)(new Vec(0, 100)),
    createFrog = createMovingObject('frog')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(defaultOid)(Constants.FROG_START_POSITION)(Vec.Zero)(1),
    // createFrog = createMovingObject('frog')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(defaultOid)(new Vec(250, 350))(Vec.Zero)(1),
    createCar = createMovingObject('car')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE)),
    createTruck = createMovingObject('truck')(new Vec(2 * Constants.GRID_SIZE, Constants.GRID_SIZE)),
    createLog = (len: number) => createMovingObject('log')(new Vec(len * Constants.GRID_SIZE, Constants.GRID_SIZE)),
    createFly = createMovingObject('fly')(new Vec(Constants.GRID_SIZE / 5, Constants.GRID_SIZE / 5)),
    createGoal = (id: string) => createTargetObject('goal')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))({ id: id, createTime: Constants.START_TIME })

  function createRandomFlies(time: number): ReadonlyArray<MovableObject> {
    const fly = createFly
      ({ id: String(time), createTime: time })
      (new Vec(Math.random() * Constants.CANVAS_WIDTH, Math.random() * (Constants.CANVAS_HEIGHT - 100)))
      (new Vec(Math.random(), Math.random()))
      (Math.random() > 0.5 ? 1 : -1)
    return [fly] as ReadonlyArray<MovableObject>
  }

  const
    gameOverTexts = [
      createTextObject('game-over')('GAME OVER')(100)(new Vec(50, 400))('blue'),
      createTextObject('retry')('CLICK TO RETRY :)')(30)(new Vec(160, 450))('blue')
    ] as ReadonlyArray<TextObject>,

    nextLevelTexts = [
      createTextObject('lvl-complete')('LEVEL COMPLETE')(70)(new Vec(25, 400))('blue'),
      createTextObject('next')('NEXT LEVEL IN ...')(30)(new Vec(160, 450))('blue')
    ] as ReadonlyArray<TextObject>,

    initialGoals = [
      createGoal('1')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      // createGoal('2')(new Vec(3 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      // createGoal('3')(new Vec(5 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      // createGoal('4')(new Vec(7 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      // createGoal('5')(new Vec(9 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
    ] as ReadonlyArray<TargetObject>,


    // create grass (safe zone)
    initialGrass = [
      createGrass('1')(new Vec(0, 650)),
      createGrass('2')(new Vec(0, 350)),
    ] as ReadonlyArray<Object>,

    // crate initial vehicles
    initialVehicles = [
      createCar({ id: '1', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 400))(new Vec(3, 0))(-1),
      createCar({ id: '2', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 450))(new Vec(2, 0))(-1),
      createCar({ id: '3', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 600))(new Vec(1, 0))(1),

      createTruck({ id: '1', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 500))(new Vec(1, 0))(1),
      createTruck({ id: '2', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 3 * Constants.GRID_SIZE, 600))(new Vec(1, 0))(1)
    ] as ReadonlyArray<MovableObject>,

    initialLogs = [
      createLog(3)({ id: '1', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 200, 300))(new Vec(2, 0))(1),
      createLog(4)({ id: '2', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 50, 250))(new Vec(0.5, 0))(-1),
      createLog(3)({ id: '3', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 200, 200))(new Vec(1, 0))(1),
      createLog(4)({ id: '4', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 50, 150))(new Vec(1.1, 0))(1),
      createLog(6)({ id: '5', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 200, 100))(new Vec(0.5, 0))(-1)
    ] as ReadonlyArray<MovableObject>,


    initialState: GameState = {
      time: 0,
      road: createRoad,
      water: createWater,
      grass: initialGrass,
      goals: initialGoals,
      frog: createFrog,
      vehicles: initialVehicles,
      logs: initialLogs,
      flies: [],
      exit: [],
      texts: [],
      score: 0,
      gameOver: false
    },

    // wrap positions around horizontally
    torusWrap = (pos: Vec, size: Vec) => {
      function wrap(x: number) {
        if (x < -size.x) return x + Constants.CANVAS_WIDTH + size.x
        if (x > Constants.CANVAS_WIDTH) return x - Constants.CANVAS_WIDTH - size.x
        return x
      }
      return new Vec(wrap(pos.x), pos.y)
    },


    moveObject = (o: MovableObject) => <MovableObject>{
      ...o,
      position: torusWrap(o.position.add(o.velocity.mult(o.direction)), o.size)
    },

    // frog is considered on object if more than half of it is on the object
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
        cut = except((a: MovableObject) => (b: MovableObject) => a.id === b.id),
        halfFrogSize = s.frog.size.x / 2,
        // if more than half of the frog falls outside the canvas, it's dead
        frogOffCanvas = s.frog.position.x < -halfFrogSize || s.frog.position.x > Constants.CANVAS_WIDTH - halfFrogSize,
        frogCollided = s.vehicles.filter(r => objectsCollided(s.frog, r)).length > 0,
        frogInWater = s.frog.position.y < s.water.position.y + s.water.size.y && s.frog.position.y + s.frog.size.x > s.water.position.y,
        frogOnLog = s.logs.filter(r => objectsOverlapped(s.frog, r)).length > 0,
        logFrogIsOn = s.logs.filter(r => objectsOverlapped(s.frog, r))[0],
        fliesCollided = s.flies.filter(r => objectsCollided(s.frog, r)),

        frogOnGoal = s.goals.filter(r => r.visited !== true).filter(r => objectsOverlapped(s.frog, r)).length > 0,
        goalVisited = s.goals.filter(r => objectsOverlapped(s.frog, r))[0],
        score = s.score + fliesCollided.length * 10 + (frogOnGoal ? 100 : 0),
        gameOver = frogOffCanvas || frogCollided
      // gameOver = false;

      if (frogOnGoal) {

        // THIS WORKS
        for (let i = 0; i < s.goals.length; i++) {
          if (goalVisited.id === s.goals[i].id) {
            s.goals[i].visited = true
          }
        }


        // // BELOW DOESNT WORK, does not change the 'visited' attribute for the goal
        // s.goals.map(g => g.id === goalVisited.id ? { ...g, visited: true } : { ...g })

      }

      const levelFinished = s.goals.filter(g => g.visited === true).length === s.goals.length

      return <GameState>{
        ...s,
        frog: {
          ...s.frog,
          velocity: frogOnLog ? logFrogIsOn.velocity.mult(logFrogIsOn.direction) : Vec.Zero,
          position: frogOnGoal ? Constants.FROG_START_POSITION : s.frog.position
        },
        flies: cut(s.flies)(fliesCollided),
        exit: s.exit.concat(fliesCollided),
        // goal: frogOnGoal ? s.goals.map(g => g.id === goalVisited.id ? { ...g, visited: true } : { ...g }) : s.goals,
        texts: levelFinished ? s.texts.concat(nextLevelTexts) : s.texts.concat(gameOver ? s.texts.concat(gameOverTexts) : s.texts),
        score: score,
        gameOver: gameOver
      }
    },

    tick = (s: GameState, elapsed: number) => {
      const
        expired = (o: Object) => (elapsed - o.createTime) > 500 || o.position.y + o.size.y > Constants.CANVAS_HEIGHT - 50 || o.position.y <= 100,
        expiredFlies: ReadonlyArray<MovableObject> = s.flies.filter(expired),
        activeFlies = s.flies.filter(o => !expired(o)),
        newFlies = activeFlies.length < Constants.FLIES_LIMIT && Math.random() < 0.005 ? activeFlies.concat(createRandomFlies(elapsed)) : activeFlies

      return handleCollisions({
        ...s,
        time: s.time + elapsed,
        frog: moveObject(s.frog),
        vehicles: s.vehicles.map(moveObject),
        logs: s.logs.map(moveObject),
        exit: expiredFlies,
        flies: newFlies.map(moveObject),
      })
    },


    /***
     * Check the bounds for moving objects
     */
    checkBounds = (s: GameState, o: MovableObject, e: Move): Vec => {
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
    },



    reduceState = (s: GameState, e: Move | Tick): GameState =>
      e instanceof Move ? <GameState>{
        ...s,
        frog: {
          ...s.frog,
          position: checkBounds(s, s.frog, e)
        }
      }
        : tick(s, e.elapsed)

  const subscription = merge(gameClock, moveUp, moveRight, moveDown, moveLeft).pipe(scan(reduceState, initialState)).subscribe(updateView)

  function updateView(s: GameState) {
    const
      canvas = document.getElementById("svgCanvas")!,
      updateObjectView = (o: Object) => {
        const v = document.getElementById(o.id) || document.createElementNS(canvas.namespaceURI, 'rect')!;
        v.setAttribute('id', o.id);
        v.setAttribute('x', String(o.position.x));
        v.setAttribute('y', String(o.position.y));

        v.setAttribute("width", String(o.size.x));
        v.setAttribute("height", String(o.size.y));
        v.classList.add(o.viewType);

        canvas.appendChild(v);
      },

      updateTextObjectView = (o: TextObject) => {
        const v = document.getElementById(o.id) || document.createElementNS(canvas.namespaceURI, 'text')!;
        v.setAttribute('id', o.id);
        v.setAttribute('x', String(o.position.x));
        v.setAttribute('y', String(o.position.y));

        v.setAttribute('font-size', String(o.size));
        v.setAttribute('fill', o.color);
        v.classList.add('text');
        v.textContent = o.text;
        canvas.appendChild(v);
      },

      updateTargetObjectView = (o: TargetObject) => {
        const v = document.getElementById(o.id);
        if (v) {
          v.classList.add(o.visited ? 'visited' : '')
        }
      }

    const score = document.getElementById("score")!;
    score.textContent = String(s.score);
    updateObjectView(s.road);
    updateObjectView(s.water);
    s.grass.forEach(updateObjectView);

    s.vehicles.forEach(updateObjectView);
    s.logs.forEach(updateObjectView);
    s.flies.forEach(updateObjectView);
    s.goals.forEach(updateObjectView);
    s.goals.filter(g => g.visited).forEach(updateTargetObjectView);

    updateObjectView(s.frog);


    s.exit.map(o => document.getElementById(o.id))
      .filter(isNotNullOrUndefined)
      .forEach(v => canvas.removeChild(v))

    if (s.goals.filter(g => g.visited).length === s.goals.length) {
      s.texts.forEach(updateTextObjectView);
      subscription.unsubscribe();
    }


    if (s.gameOver) {
      subscription.unsubscribe();
      s.texts.forEach(updateTextObjectView);

      function mouseOnCanvas(x: number, y: number) {
        return x > 0 && x < Constants.CANVAS_WIDTH && y > 0 && y < Constants.CANVAS_HEIGHT
      }

      const mouseClick = fromEvent<MouseEvent>(document, "mousedown").pipe(filter(({ x, y }) => mouseOnCanvas(x, y))).subscribe(retry);

      function retry() {
        mouseClick.unsubscribe();
        canvas.removeChild(document.getElementById("game-over")!);
        canvas.removeChild(document.getElementById("retry")!);
        s.flies.forEach(f => canvas.removeChild(document.getElementById(f.id)!));
        main();
      }

    }


  }
}

/**
   * Utility functions (from Asteroids Example provided)
   */
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
        (b: ReadonlyArray<T>) => a.filter(not(elem(eq)(b)))

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
    main();
  };
}