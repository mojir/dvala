import type { DvalaModule } from '../../../../src/builtin/modules/interface'
import { getFsModule } from './Fs/index.js'
import { getProcModule } from './Proc/index.js'

export function getCliModules(): DvalaModule[] {
  return [getFsModule(), getProcModule()]
}
