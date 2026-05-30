import type { DvalaModule } from '@mojir/dvala-engine'
import { getFsModule } from './Fs/index.js'
import { getProcModule } from './Proc/index.js'

export function getCliModules(): DvalaModule[] {
  return [getFsModule(), getProcModule()]
}
