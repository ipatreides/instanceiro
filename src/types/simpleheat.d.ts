declare module "simpleheat" {
  interface SimpleHeat {
    data(data: [number, number, number][]): SimpleHeat;
    max(max: number): SimpleHeat;
    add(point: [number, number, number]): SimpleHeat;
    clear(): SimpleHeat;
    radius(r: number, blur?: number): SimpleHeat;
    resize(): void;
    gradient(grad: Record<number, string>): SimpleHeat;
    draw(minOpacity?: number): SimpleHeat;
  }

  function simpleheat(canvas: HTMLCanvasElement): SimpleHeat;
  export = simpleheat;
}
