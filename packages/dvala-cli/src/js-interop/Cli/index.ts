import type { DvalaModule } from '../../../../../src'
import { getFsModule } from './Fs/index.js'
import { getProcModule } from './Proc/index.js'

export function getCliModules(): DvalaModule[] {
  return [getFsModule(), getProcModule()]
}
