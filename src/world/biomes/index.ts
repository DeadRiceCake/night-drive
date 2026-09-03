import type { Rng } from '../../core/rng'
import type { RoadBuilder } from '../../road/segments'
import type { PropFactory } from '../props'
import type { Biome } from '../../tokens'
import { countryside } from './countryside'
import { city } from './city'
import { highway } from './highway'

export interface ChunkCtx {
  rng: Rng
  props: PropFactory
  /** Whether an overlay wall section may be generated in this chunk. */
  allowWall: boolean
}

export type ChunkGenerator = (b: RoadBuilder, ctx: ChunkCtx) => void

export const GENERATORS: Record<Biome, ChunkGenerator> = { countryside, city, highway }

/** Traffic density per biome (0..1). */
export const DENSITY: Record<Biome, number> = { countryside: 0.3, city: 0.85, highway: 0.6 }
