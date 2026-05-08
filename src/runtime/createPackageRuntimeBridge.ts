import type { DvalaBundle } from '../bundler/interface'
import {
  createPackageRuntimeBridge as createPackageRuntimeBridgePackage,
  type ArtifactCompatibilityBridge,
  type BridgeProgramRunOptions,
  type CreatePackageRuntimeBridgeOptions as PackageCreatePackageRuntimeBridgeOptions,
  type DvalaRunAsyncOptions,
  type DvalaRuntime,
  type RuntimeBridgeExecutionContext,
  type RuntimeHandlers,
  type RuntimeHost,
  type RuntimeIdentity,
  type RuntimeRunResult,
  type RuntimeResumeOptions,
  type RuntimeSnapshot,
} from '@mojir/dvala-runtime'
import {
  createDefaultRuntimeBridgeAdapter,
  type BridgeRunnerOptions,
  toRuntimeResumeOptions,
  toRuntimeRunOptions,
} from './createDefaultRuntimeBridgeAdapter'

export type RuntimeArtifactBridge = ArtifactCompatibilityBridge<string | DvalaBundle, RuntimeSnapshot, RuntimeHost>

export interface CreatePackageRuntimeBridgeOptions extends BridgeRunnerOptions {
  identity: RuntimeIdentity
  artifactBridge: RuntimeArtifactBridge
  hostToHandlers?: (host: RuntimeHost) => RuntimeHandlers | undefined
  programRunOptions?: BridgeProgramRunOptions
  runProgram?: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RuntimeRunResult>
  resumeProgram?: (
    snapshot: RuntimeSnapshot,
    value: unknown,
    options?: RuntimeResumeOptions,
  ) => Promise<RuntimeRunResult>
}

export function createPackageRuntimeBridge(options: CreatePackageRuntimeBridgeOptions): DvalaRuntime {
  const defaultAdapter =
    options.runProgram || options.resumeProgram ? undefined : createDefaultRuntimeBridgeAdapter(options)

  const packageOptions: PackageCreatePackageRuntimeBridgeOptions<string | DvalaBundle, RuntimeSnapshot, RuntimeHost> = {
    identity: options.identity,
    artifactBridge: options.artifactBridge,
    hostToHandlers: options.hostToHandlers,
    programRunOptions: options.programRunOptions,
    runProgram(source, context?: RuntimeBridgeExecutionContext) {
      if (options.runProgram) return options.runProgram(source, toRuntimeRunOptions(context))
      return defaultAdapter!.runProgram(source, context)
    },
    resumeProgram(snapshot, value, context?: RuntimeBridgeExecutionContext) {
      if (options.resumeProgram)
        return options.resumeProgram(snapshot, value, toRuntimeResumeOptions(options.modules, context))
      return defaultAdapter!.resumeProgram(snapshot, value, context)
    },
  }

  return createPackageRuntimeBridgePackage(packageOptions)
}
