import { Farmhouse } from './FarmScenery'

// The Farmer's House on the grid: FarmScenery's farmhouse drawing, standing on its 2 × 2
// footprint's centre (the drawing's own ground point is its (x, y)).
export function FarmerHouseSprite() {
  return <Farmhouse x={0} y={0} />
}
