export type CapabilityPolicy = {
  allowedEffects: readonly string[]
  mode: 'strict' | 'development'
}
