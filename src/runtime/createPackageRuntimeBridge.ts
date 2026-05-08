import type { DvalaBundle } from '../bundler/interface'
import {
  createPackageRuntimeBridge as createPackageRuntimeBridgePackage,
  type ArtifactCompatibilityBridge,
  type CreatePackageRuntimeBridgeOptions as PackageCreatePackageRuntimeBridgeOptions,
  type DvalaRuntime,
  type RuntimeHost,
  type RuntimeSnapshot,
} from '@mojir/dvala-runtime'
import {
  createRootRuntimeBridgeCallbacks,
  type BridgeRuntimeOverrides,
  type BridgeRunnerOptions,
} from './createDefaultRuntimeBridgeAdapter'

export type RuntimeArtifactBridge = ArtifactCompatibilityBridge<string | DvalaBundle, RuntimeSnapshot, RuntimeHost>

type PackageRuntimeBridgeBaseOptions = Omit<
  PackageCreatePackageRuntimeBridgeOptions<string | DvalaBundle, RuntimeSnapshot, RuntimeHost>,
  'runProgram' | 'resumeProgram'
>

export interface CreatePackageRuntimeBridgeOptions extends BridgeRunnerOptions, PackageRuntimeBridgeBaseOptions {
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
