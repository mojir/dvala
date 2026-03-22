import type { DvalaModule } from './builtin/modules/interface'
import { assertModule } from './builtin/modules/assertion'
import { gridModule } from './builtin/modules/grid'
import { vectorModule } from './builtin/modules/vector'
import { linearAlgebraModule } from './builtin/modules/linear-algebra'
import { matrixModule } from './builtin/modules/matrix'
import { numberTheoryModule } from './builtin/modules/number-theory'
import { mathUtilsModule } from './builtin/modules/math'
import { functionalUtilsModule } from './builtin/modules/functional'
import { stringUtilsModule } from './builtin/modules/string'
import { collectionUtilsModule } from './builtin/modules/collection'
import { sequenceUtilsModule } from './builtin/modules/sequence'
import { bitwiseUtilsModule } from './builtin/modules/bitwise'
import { convertModule } from './builtin/modules/convert'
import { jsonModule } from './builtin/modules/json'
import { timeModule } from './builtin/modules/time'
import { handlerModule } from './builtin/modules/handler'

export const allBuiltinModules: DvalaModule[] = [
  assertModule,
  gridModule,
  vectorModule,
  linearAlgebraModule,
  matrixModule,
  numberTheoryModule,
  mathUtilsModule,
  functionalUtilsModule,
  stringUtilsModule,
  collectionUtilsModule,
  sequenceUtilsModule,
  bitwiseUtilsModule,
  convertModule,
  jsonModule,
  timeModule,
  handlerModule,
]
