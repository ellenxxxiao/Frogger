import "./style.css";
import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type Event = 'keydown' | 'keyup';

function main() {

  const Constants = {
    CANVAS_HEIGHT: 750,
    CANVAS_WIDTH: 550,
    GRID_SIZE: 50,
    FLIES_LIMIT: 2,
    START_TIME: 0,
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
  // Object state
  interface IObject extends Rect, ObjectId {
    viewType: ViewType,
  }

  interface IMovingObject extends IObject {
    velocity: Vec,
    direction: number  // -1 = left, 1 = right
  }

  interface ITarget extends IObject {
    visited: boolean
  }

  type Object = Readonly<IObject>
  type MovingObject = Readonly<IMovingObject>
  type TargetObject = Readonly<ITarget>


  // Game state
  type GameState = Readonly<{
    time: number,
    road: Object,
    water: Object,
    grass: ReadonlyArray<Object>,
    goals: ReadonlyArray<TargetObject>,
    frog: MovingObject,
    vehicles: ReadonlyArray<MovingObject>,
    logs: ReadonlyArray<MovingObject>,
    flies: ReadonlyArray<MovingObject>,
    exit: ReadonlyArray<MovingObject>,
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
    <MovingObject>{
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

  const
    defaultOid = { id: '0', createTime: Constants.START_TIME },
    createGrass = (id: string) => createObject('grass')(new Vec(Constants.CANVAS_WIDTH, Constants.GRID_SIZE))({ id: id, createTime: Constants.START_TIME }),
    createRoad = createObject('road')(new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE))(defaultOid)(new Vec(0, 400)),
    createWater = createObject('water')(new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE))(defaultOid)(new Vec(0, 100)),
    // createFrog = createMovingObject('frog')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(defaultOid)(new Vec((Constants.CANVAS_WIDTH - Constants.GRID_SIZE) / 2, Constants.CANVAS_HEIGHT - 2 * Constants.GRID_SIZE))(Vec.Zero)(1),
    createFrog = createMovingObject('frog')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(defaultOid)(new Vec(250, 350))(Vec.Zero)(1),
    createCar = createMovingObject('car')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE)),
    createTruck = createMovingObject('truck')(new Vec(2 * Constants.GRID_SIZE, Constants.GRID_SIZE)),
    createLog = (len: number) => createMovingObject('log')(new Vec(len * Constants.GRID_SIZE, Constants.GRID_SIZE)),
    createFly = createMovingObject('fly')(new Vec(Constants.GRID_SIZE / 5, Constants.GRID_SIZE / 5)),
    createGoal = (id: string) => createTargetObject('goal')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))({ id: id, createTime: Constants.START_TIME })

  function createRandomFlies(time: number): ReadonlyArray<MovingObject> {
    const fly = createFly
      ({ id: String(time), createTime: time })
      (new Vec(Math.random() * Constants.CANVAS_WIDTH, Math.random() * (Constants.CANVAS_HEIGHT - 100)))
      (new Vec(Math.random(), Math.random()))
      (Math.random() > 0.5 ? 1 : -1)
    return [fly] as ReadonlyArray<MovingObject>
  }

  const
    initialGoals = [
      createGoal('1')(new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      createGoal('2')(new Vec(3 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      createGoal('3')(new Vec(5 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      createGoal('4')(new Vec(7 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
      createGoal('5')(new Vec(9 * Constants.GRID_SIZE, Constants.GRID_SIZE))(false),
    ] as ReadonlyArray<TargetObject>,


    // create grass (safe zone)
    initialGrass = [
      createGrass('1')(new Vec(0, 650)),
      createGrass('2')(new Vec(0, 350)),
    ] as ReadonlyArray<Object>,

    // crate initial vehicles
    initialVehicles = [
      createCar({ id: '1', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 400))(new Vec(5, 0))(-1),
      createCar({ id: '2', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 450))(new Vec(2, 0))(-1),
      createCar({ id: '3', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 600))(new Vec(1, 0))(1),

      createTruck({ id: '1', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH, 500))(new Vec(1, 0))(1),
      createTruck({ id: '2', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 3 * Constants.GRID_SIZE, 600))(new Vec(1, 0))(1)
    ] as ReadonlyArray<MovingObject>,

    initialLogs = [
      createLog(3)({ id: '1', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 200, 300))(new Vec(2, 0))(1),
      createLog(4)({ id: '2', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 50, 250))(new Vec(0.5, 0))(-1),
      createLog(3)({ id: '3', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 200, 200))(new Vec(1, 0))(1),
      createLog(4)({ id: '4', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 50, 150))(new Vec(1.1, 0))(1),
      createLog(3)({ id: '5', createTime: Constants.START_TIME })(new Vec(Constants.CANVAS_WIDTH + 200, 100))(new Vec(0.5, 0))(-1),
    ] as ReadonlyArray<MovingObject>,


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
      score: 0,
      gameOver: false
    },

    // wrap positions around horizontally
    torusWrap = (pos: Vec, size: Vec) => {
      const width = Constants.CANVAS_WIDTH
      function wrap(x: number) {
        if (x < -size.x) return x + width + size.x
        if (x > width) return x - width - size.x
        return x
      }
      return new Vec(wrap(pos.x), pos.y)
    },


    moveObject = (o: MovingObject) => <MovingObject>{
      ...o,
      position: torusWrap(o.position.add(o.velocity.mult(o.direction)), o.size)
    },

    bodiesOverlapped = ([frog, log]: [Object, Object]) => {
      const xOverlapped = frog.position.x + frog.size.x / 2 > log.position.x && frog.position.x + frog.size.x <= log.position.x + log.size.x
      const yOverlapped = frog.position.y + frog.size.y / 2 > log.position.y && frog.position.y + frog.size.y <= log.position.y + log.size.y
      return xOverlapped && yOverlapped
    },

    bodiesCollided = ([frog, obj]: [Object, Object]) => {
      return frog.position.x + frog.size.x > obj.position.x && frog.position.x < obj.position.x + obj.size.x &&
        frog.position.y + frog.size.y > obj.position.y && frog.position.y < obj.position.y + obj.size.y
    },



    handleCollisions = (s: GameState) => {
      const
        cut = except((a: MovingObject) => (b: MovingObject) => a.id === b.id),
        halfFrogSize = s.frog.size.x / 2,
        // if more than half of the frog falls outside the canvas, it's dead
        frogOffCanvas = s.frog.position.x < -halfFrogSize || s.frog.position.x > Constants.CANVAS_WIDTH - halfFrogSize,
        frogCollided = s.vehicles.filter(r => bodiesCollided([s.frog, r])).length > 0,
        frogInWater = s.frog.position.y < s.water.position.y + s.water.size.y && s.frog.position.y + s.frog.size.x > s.water.position.y,
        frogOnLog = s.logs.filter(r => bodiesOverlapped([s.frog, r])).length > 0,
        logFrogIsOn = s.logs.filter(r => bodiesOverlapped([s.frog, r]))[0],
        fliesCollided = s.flies.filter(r => bodiesCollided([s.frog, r])),

        frogOnGoal = s.goals.filter(r => bodiesOverlapped([s.frog, r])).length > 0,
        score = s.score + fliesCollided.length * 10 + (frogOnGoal ? 100 : 0)

      return <GameState>{
        ...s,
        frog: {
          ...s.frog,
          velocity: frogOnLog ? logFrogIsOn.velocity.mult(logFrogIsOn.direction) : Vec.Zero,
          direction: frogOnLog ? logFrogIsOn.direction : s.frog.direction,
          position: frogOnGoal ? new Vec(Constants.CANVAS_WIDTH / 2, Constants.CANVAS_HEIGHT - 100) : s.frog.position
        },
        flies: cut(s.flies)(fliesCollided),
        exit: s.exit.concat(fliesCollided),
        score: score,
        gameOver: frogOffCanvas || frogCollided || (frogInWater && !frogOnLog)
      }
    },

    tick = (s: GameState, elapsed: number) => {
      const
        expired = (o: Object) => (elapsed - o.createTime) > 500 || o.position.y + o.size.y > Constants.CANVAS_HEIGHT - 50 || o.position.y <= 100,
        expiredFlies: ReadonlyArray<MovingObject> = s.flies.filter(expired),
        activeFlies = s.flies.filter(o => !expired(o)),
        newFlies = activeFlies.length < Constants.FLIES_LIMIT && Math.random() < 0.005 ? activeFlies.concat(createRandomFlies(elapsed)) : activeFlies
      return handleCollisions({
        ...s,
        time: s.time + elapsed,
        frog: moveObject(s.frog),
        vehicles: s.vehicles.map(moveObject),
        logs: s.logs.map(moveObject),
        exit: expiredFlies,
        flies: newFlies.map(moveObject)

        // flies: s.flies.filter(f => !expired(f)).map(moveObject)
      })
    },

    // if movement left is not enough for a full grid, move frog to the edge of the canvas
    checkBounds = (o: MovingObject, e: Move): Vec => {
      if (o.position.x + e.movement.x < 0) {
        return new Vec(0, o.position.y)
      }
      if (o.position.x + e.movement.x > Constants.CANVAS_WIDTH - Constants.GRID_SIZE) {
        return new Vec(Constants.CANVAS_WIDTH - Constants.GRID_SIZE, o.position.y)
      }
      if (o.position.y + e.movement.y < Constants.GRID_SIZE) {
        return new Vec(o.position.x, Constants.GRID_SIZE)
      }
      if (o.position.y + e.movement.y > Constants.CANVAS_HEIGHT - 2 * Constants.GRID_SIZE) {
        return new Vec(o.position.x, Constants.CANVAS_HEIGHT - 2 * Constants.GRID_SIZE)
      }
      return o.position.add(e.movement);
    },


    reduceState = (s: GameState, e: Move | Tick): GameState =>
      e instanceof Move ? <GameState>{
        ...s,
        frog: {
          ...s.frog,
          position: checkBounds(s.frog, e)
        }
      }
        : tick(s, e.elapsed)

  const subscription = merge(gameClock, moveUp, moveRight, moveDown, moveLeft).pipe(scan(reduceState, initialState)).subscribe(updateView)

  function updateView(s: GameState) {
    const
      canvas = document.getElementById("svgCanvas")!,
      updateObjectView = (o: Object) => {
        function createObjectView() {
          const v = document.createElementNS(canvas.namespaceURI, 'rect')!;
          v.setAttribute('id', o.id);
          v.setAttribute("width", o.size.x.toString());
          v.setAttribute("height", o.size.y.toString());
          v.classList.add(o.viewType);
          canvas.appendChild(v);
          return v;
        }
        const v = document.getElementById(o.id) || createObjectView();
        v.setAttribute('x', o.position.x.toString());
        v.setAttribute('y', o.position.y.toString());
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

    updateObjectView(s.frog);

    s.exit.map(o => document.getElementById(o.id))
      .filter(isNotNullOrUndefined)
      .forEach(v => {
        try {
          canvas.removeChild(v)
        } catch (e) {
          // rarely it can happen that a bullet can be in exit 
          // for both expiring and colliding in the same tick,
          // which will cause this exception
          console.log("Already removed: " + v.id)
        }
      })

    if (s.gameOver) {
      subscription.unsubscribe();
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