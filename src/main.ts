import "./style.css";
import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";
import { WatchIgnorePlugin } from "webpack";

type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type Event = 'keydown' | 'keyup';

function main() {

  const Constants = {
    CANVAS_HEIGHT: 750,
    CANVAS_WIDTH: 550,
    GRID_SIZE: 50,
    CARS_COUNT_PER_ROW: 2,
    CARS_COUNT_TOTAL: 10,
    START_TIME: 0,
  } as const

  // our game has the following view element types
  type ViewType = 'frog' | 'car' | 'truck' | 'log' | 'road' | 'water' | 'grass' | 'goal'

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
  interface IObjectState extends Rect, ObjectId {
    viewType: ViewType,
    velocity: Vec,
    direction: number  // -1 = left, 1 = right
  }

  type ObjectState = Readonly<IObjectState>

  // Game state
  type GameState = Readonly<{
    time: number,
    road: ObjectState,
    water: ObjectState,
    grass: ReadonlyArray<ObjectState>,
    goals: ReadonlyArray<ObjectState>,
    frog: ObjectState,
    cars: ReadonlyArray<ObjectState>,
    logs: ReadonlyArray<ObjectState>,
    score: number,
    gameOver: boolean
  }>

  // Create grass
  function createGrass(oid: string, pos: Vec): ObjectState {
    return {
      id: 'grass-' + oid,
      viewType: 'grass',
      position: pos,
      size: new Vec(Constants.CANVAS_WIDTH, Constants.GRID_SIZE),
      velocity: Vec.Zero,
      direction: 1,
      createTime: Constants.START_TIME
    }
  }

  // Create road
  function createRoad(): ObjectState {
    return {
      id: 'road',
      viewType: 'road',
      position: new Vec(0, 400),
      size: new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE),
      velocity: Vec.Zero,
      direction: 1,
      createTime: Constants.START_TIME
    }
  }

  function createWater(): ObjectState {
    return {
      id: 'water',
      viewType: 'water',
      position: new Vec(0, 100),
      size: new Vec(Constants.CANVAS_WIDTH, 5 * Constants.GRID_SIZE),
      velocity: Vec.Zero,
      direction: 1,
      createTime: Constants.START_TIME
    }
  }

  // Create frog
  function createFrog(): ObjectState {
    return {
      id: 'frog',
      viewType: 'frog',
      // initialize the frog in the bottom center
      // position: new Vec((Constants.CANVAS_WIDTH - Constants.GRID_SIZE) / 2, Constants.CANVAS_HEIGHT - 2 * Constants.GRID_SIZE),
      position: new Vec(250, 350),  // in the middle safe zone
      size: new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE),
      velocity: Vec.Zero,
      direction: 1,
      createTime: Constants.START_TIME
    }
  }
  // Create rectangle (all objects are rectangles)
  function createRect(viewType: ViewType, oid: ObjectId, rect: Rect, vel: Vec, dir: number): ObjectState {
    return {
      ...oid,
      ...rect,
      viewType: viewType,
      id: viewType + '-' + oid.id,
      direction: dir,
      velocity: vel,
    }
  }

  function createCar(id: string, pos: Vec, vel: Vec, dir: number): ObjectState {
    return createRect(
      'car',
      { id: id, createTime: Constants.START_TIME },
      {
        position: pos,
        size: new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE)
      },
      vel,
      dir)
  }

  function createTruck(id: string, pos: Vec, vel: Vec, dir: number): ObjectState {
    return createRect(
      'truck',
      { id: id, createTime: Constants.START_TIME },
      {
        position: pos,
        size: new Vec(2 * Constants.GRID_SIZE, Constants.GRID_SIZE)
      },
      vel,
      dir)
  }

  function createLog(id: string, pos: Vec, vel: Vec, dir: number, len: number): ObjectState {
    return createRect(
      'log',
      { id: id, createTime: Constants.START_TIME },
      {
        position: pos,
        size: new Vec(len * Constants.GRID_SIZE, Constants.GRID_SIZE)
      },
      vel,
      dir)
  }

  function createGoal(id: string, pos: Vec): ObjectState {
    return createRect(
      'goal',
      { id: id, createTime: Constants.START_TIME },
      {
        position: pos,
        size: new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE)
      },
      Vec.Zero,
      1)
  }

  const
    initialGoals = [
      createGoal('1', new Vec(Constants.GRID_SIZE, Constants.GRID_SIZE)),
      createGoal('2', new Vec(Constants.GRID_SIZE * 3, Constants.GRID_SIZE)),
      createGoal('3', new Vec(Constants.GRID_SIZE * 5, Constants.GRID_SIZE)),
      createGoal('4', new Vec(Constants.GRID_SIZE * 7, Constants.GRID_SIZE)),
      createGoal('5', new Vec(Constants.GRID_SIZE * 9, Constants.GRID_SIZE))
    ] as ReadonlyArray<ObjectState>,


    // create grass (safe zone)
    initialGrass = [
      createGrass('1', new Vec(0, 350)),
      createGrass('2', new Vec(0, 650))
    ] as ReadonlyArray<ObjectState>,

    // crate initial cars
    initialCars = [
      createCar('1', new Vec(Constants.CANVAS_WIDTH, 400), new Vec(5, 0), -1),
      createCar('2', new Vec(Constants.CANVAS_WIDTH, 450), new Vec(2, 0), -1),
      createCar('3', new Vec(Constants.CANVAS_WIDTH, 600), new Vec(1, 0), 1),
      createTruck('1', new Vec(Constants.CANVAS_WIDTH, 500), new Vec(3, 0), -1),
      createTruck('2', new Vec(Constants.CANVAS_WIDTH + 3 * Constants.GRID_SIZE, 600), new Vec(1, 0), 1),
    ] as ReadonlyArray<ObjectState>,

    initialLogs = [
      createLog('1', new Vec(Constants.CANVAS_WIDTH + 200, 300), new Vec(0.5, 0), 1, 3),
      createLog('2', new Vec(Constants.CANVAS_WIDTH + 50, 250), new Vec(0.5, 0), -1, 4),
      createLog('3', new Vec(Constants.CANVAS_WIDTH, 200), new Vec(0.5, 0), 1, 3),
      createLog('4', new Vec(Constants.CANVAS_WIDTH + 50, 150), new Vec(0.5, 0), 1, 4),
      createLog('5', new Vec(Constants.CANVAS_WIDTH + 200, 100), new Vec(0.5, 0), -1, 3),
    ] as ReadonlyArray<ObjectState>,

    initialState: GameState = {
      time: 0,
      road: createRoad(),
      water: createWater(),
      grass: initialGrass,
      goals: initialGoals,
      frog: createFrog(),
      cars: initialCars,
      logs: initialLogs,
      score: 0,
      gameOver: false
    },

    // wrap positions around horizontally
    torusWrap = ({ x, y }: Vec) => {
      const s = Constants.CANVAS_WIDTH,
        wrap = (v: number) => v < 0 ? v + s : v > s ? v - s : v;
      return new Vec(wrap(x), y)
    },


    moveObject = (o: ObjectState) => <ObjectState>{
      ...o,
      position: torusWrap(o.position.add(o.velocity.multX(o.direction)))
    },

    bodiesOverlapped = ([frog, log]: [ObjectState, ObjectState]) => {
      const xOverlapped = frog.position.x + frog.size.x / 2 > log.position.x && frog.position.x + frog.size.x <= log.position.x + log.size.x
      const yOverlapped = frog.position.y + frog.size.y / 2 > log.position.y && frog.position.y + frog.size.y <= log.position.y + log.size.y
      return xOverlapped && yOverlapped
    },


    handleCollisions = (s: GameState) => {
      console.log("WATER POS Y" + s.water.position.y)
      console.log("WATER SIZE Y" + s.water.size.y)
      console.log(s.frog.position.y)
      const
        bodiesCollided = ([a, b]: [ObjectState, ObjectState]) => a.position.sub(b.position).len() < a.size.x,
        // bodiesOverlapped = ([a, b]: [ObjectState, ObjectState]) => a.position.sub(b.position).len() >= 0 && a.position.sub(b.position).len() <= b.size.x - a.size.x,
        // 为什么跟着往左走的log，跟着跟着就不跟了
        frogOffCanvas = s.frog.position.x < 0 || s.frog.position.x > Constants.CANVAS_WIDTH - 25,
        frogCollided = s.cars.filter(r => bodiesCollided([s.frog, r])).length > 0,
        frogInWater = s.frog.position.y < s.water.position.y + s.water.size.y && s.frog.position.y > s.water.position.y,
        frogOnLog = s.logs.filter(r => bodiesOverlapped([s.frog, r])).length > 0,
        frogOnGoal = s.goals.filter(r => bodiesOverlapped([s.frog, r])).length > 0,
        logFrogIsOn = s.logs.filter(r => bodiesOverlapped([s.frog, r]))[0]
      if (frogOnGoal) {
        console.log("ON")
      }
      return <GameState>{
        ...s,
        // gameOver: frogCollided || !frogOnLog && frogInWater
        // 为什么这里是Vec /2才对？？？？？？？？？？？？？？？
        frog: moveObject(
          {
            ...s.frog,
            velocity: frogOnLog ? logFrogIsOn.velocity.divideBy2() : Vec.Zero,
            direction: frogOnLog ? logFrogIsOn.direction : 1
          }),
        score: frogOnGoal ? s.score + 100 : s.score,
        gameOver: frogOffCanvas || frogCollided || !frogOnLog && frogInWater
      }
    },

    tick = (s: GameState, elapsed: number) => {
      return handleCollisions({
        ...s,
        time: s.time + elapsed,
        frog: moveObject(s.frog),
        cars: s.cars.map(moveObject),
        logs: s.logs.map(moveObject)
      })
    },

    // if movement left is not enough for a full grid, move frog to the edge of the canvas
    checkBounds = (o: ObjectState, e: Move): Vec => {
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
      frog = document.getElementById("frog")!,
      updateObjectView = (o: ObjectState) => {
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
    // 
    const score = document.getElementById("score")!;
    score.textContent = String(s.score);
    updateObjectView(s.road);
    updateObjectView(s.water);
    s.grass.forEach(updateObjectView);

    s.cars.forEach(updateObjectView);
    s.logs.forEach(updateObjectView);
    s.goals.forEach(updateObjectView);

    updateObjectView(s.frog);

    if (s.gameOver) {
      subscription.unsubscribe();
    }


  }
}

/**
   * Utility functions
   */
class Vec {
  constructor(public readonly x: number = 0, public readonly y: number = 0) { }
  add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b: Vec) => new Vec(this.x - b.x, this.y - b.y)
  len = () => Math.sqrt(this.x * this.x + this.y * this.y)
  multX = (s: number) => new Vec(this.x * s, this.y)
  divideBy2 = () => new Vec(this.x / 2, this.y)
  static Zero = new Vec();
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}