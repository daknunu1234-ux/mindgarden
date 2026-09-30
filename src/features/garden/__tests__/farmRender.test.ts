import { describe, expect, it } from 'vitest'
import { IslandBase, OceanLayer, SkyClouds, WorldClouds } from '../components/FarmDiorama'
import { FarmIsometricGrid } from '../components/FarmIsometricGrid'
import { StreamNetwork, TreePlots } from '../components/FarmStructures'

// The farm stays smooth because opening a popover, dragging the camera or moving a ghost never
// re-renders the grid's heavy layers: they are React.memo components with stable props. Losing the
// memo (e.g. a refactor back to a plain function) silently brings the lag back, so pin it.
const MEMO = Symbol.for('react.memo')

describe('memoized farm layers', () => {
  it('keeps the grid and its heavy layers memoized', () => {
    for (const [name, component] of Object.entries({ FarmIsometricGrid, IslandBase, OceanLayer, WorldClouds, SkyClouds, TreePlots, StreamNetwork })) {
      expect((component as unknown as { $$typeof: symbol }).$$typeof, name).toBe(MEMO)
    }
  })
})
