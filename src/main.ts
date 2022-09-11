import "./style.css";
import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type Event = 'keydown' | 'keyup';

function main() {

  const Constants = {
    CANVAS_HEIGHT: 750,
    CANVAS_WIDTH: 550,
    GRID_SIZE: 50
  } as const

  // our game has the following view element types
  type ViewType = 'frog' | 'car'

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

  // Object state
  type ObjectState = Readonly<{
    id: string,
    viewType: ViewType,
    position: Vec,
    // movement: Vec,
    // velocity: Vec,
    createTime: number
  }>

  // Game state
  type GameState = Readonly<{
    time: number,
    frog: ObjectState,
    gameOver: boolean
  }>

  // Create frog
  function createFrog(): ObjectState {
    return {
      id: 'frog',
      viewType: 'frog',
      // initialize the frog in the bottom center
      position: new Vec((Constants.CANVAS_WIDTH - Constants.GRID_SIZE) / 2, Constants.CANVAS_HEIGHT - Constants.GRID_SIZE),
      // movement: Vec.Zero,
      // velocity: Vec.Zero,
      createTime: 0
    }
  }

  const
    initialState: GameState = {
      time: 0,
      frog: createFrog(),
      gameOver: false
    },

    // tick = (s: GameState, elapsed: number) => {
    //   const
    //     expired = (b: Body) => (elapsed - b.createTime) > 100,
    //     expiredBullets: Body[] = s.bullets.filter(expired),
    //     activeBullets = s.bullets.filter(not(expired));
    //   return handleCollisions({
    //     ...s,
    //     ship: moveBody(s.ship),
    //     bullets: activeBullets.map(moveBody),
    //     rocks: s.rocks.map(moveBody),
    //     exit: expiredBullets,
    //     time: elapsed
    //   })
    // },

    checkBounds = (o: ObjectState, e: Move): Boolean => {
      if (o.position.x + e.movement.x < 0 || o.position.x + e.movement.x > Constants.CANVAS_WIDTH - Constants.GRID_SIZE) {
        return false;
      }
      if (o.position.y + e.movement.y < 0 || o.position.y + e.movement.y > Constants.CANVAS_HEIGHT - Constants.GRID_SIZE) {
        return false;
      }
      return true;
    },

    reduceState = (s: GameState, e: Move | Tick): GameState =>
      e instanceof Move ? <GameState>{
        ...s,
        frog: {
          ...s.frog,
          position: checkBounds(s.frog, e) ? s.frog.position.add(e.movement) : s.frog.position
        }
      }
        : s

  const subscription = merge(moveUp, moveRight, moveDown, moveLeft).pipe(scan(reduceState, initialState)).subscribe(updateView)

  function updateView(s: GameState) {
    const
      canvas = document.getElementById("svgCanvas")!,
      frog = document.getElementById("frog")!
    // updateObjectView = (o: ObjectState) => {
    //   function createObjectView() {
    //     const v = document.createElementNS(canvas.namespaceURI, 'rect');
    //     v.setAttribute('id', o.id);
    //     v.setAttribute('width', Constants.GRID_SIZE.toString());
    //     v.setAttribute('height', Constants.GRID_SIZE.toString());
    //     // attr(v, { id: o.id, width: Constants.GRID_SIZE, height: Constants.GRID_SIZE });
    //     v.classList.add(o.viewType);
    //     canvas.appendChild(v);
    //     return v;
    //   }
    //   const v = document.getElementById(o.id) || createObjectView();
    //   v.setAttribute('x', o.position.x.toString());
    //   v.setAttribute('y', o.position.y.toString());
    //   // attr(v, { x: o.position.x, y: o.position.y });
    // };
    frog.setAttribute('transform', `translate(${s.frog.position.x}, ${s.frog.position.y})`);

  }

  /**
   * Utility functions
   */
}


class Vec {
  constructor(public readonly x: number = 0, public readonly y: number = 0) { }
  add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b: Vec) => new Vec(this.x - b.x, this.y - b.y)
  len = () => Math.sqrt(this.x * this.x + this.y * this.y)
  static Zero = new Vec();
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}