import type { DvalaBundle } from '../bundler/interface'
import {
  createPackageRuntimeBridge as createPackageRuntimeBridgePackage,
  type ArtifactCompatibilityBridge,
  type BridgeProgramRunOptions,
  type CreatePackageRuntimeBridgeOptions as PackageCreatePackageRuntimeBridgeOptions,
  type DvalaRuntime,
  type RuntimeHandlers,
  type RuntimeHost,
  type RuntimeIdentity,
  type RuntimeSnapshot,
} from '@mojir/dvala-runtime'
import {
  createRootRuntimeBridgeCallbacks,
  type BridgeRuntimeOverrides,
  type BridgeRunnerOptions,
} from './createDefaultRuntimeBridgeAdapter'

export type RuntimeArtifactBridge = ArtifactCompatibilityBridge<string | DvalaBundle, RuntimeSnapshot, RuntimeHost>

export interface CreatePackageRuntimeBridgeOptions extends BridgeRunnerOptions {
  identity: RuntimeIdentity
  artifactBridge: RuntimeArtifactBridge
  hostToHandlers?: (host: RuntimeHost) => RuntimeHandlers | undefined
  programRunOptions?: BridgeProgramRunOptions
  runProgram?: BridgeRuntimeOverrides['runProgram']
  resumeProgram?: BridgeRuntimeOverrides['resumeProgram']
}

export function createPackageRuntimeBridge(options: CreatePackageRuntimeBridgeOptions): DvalaRuntime {
  const callbacks = createRootRuntimeBridgeCallbacks(options, {
    runProgram: options.runProgram,
    resumeProgram: options.resumeProgram,
  })

  const packageOptions: PackageCreatePackageRuntimeBridgeOptions<string | DvalaBundle, RuntimeSnapshot, RuntimeHost> = {
    identity: options.identity,
    artifactBridge: options.artifactBridge,
    hostToHandlers: options.hostToHandlers,
    programRunOptions: options.programRunOptions,
    runProgram: callbacks.runProgram,
    resumeProgram: callbacks.resumeProgram,
  }

  return createPackageRuntimeBridgePackage(packageOptions)
}
