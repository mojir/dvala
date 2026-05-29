import type { DvalaModule } from '@mojir/dvala-engine'
import { assertModule } from '@mojir/dvala-engine'
import { gridModule } from '@mojir/dvala-engine'
import { vectorModule } from '@mojir/dvala-engine'
import { linearAlgebraModule } from '@mojir/dvala-engine'
import { matrixModule } from '@mojir/dvala-engine'
import { numberTheoryModule } from '@mojir/dvala-engine'
import { mathUtilsModule } from '@mojir/dvala-engine'
import { functionalUtilsModule } from '@mojir/dvala-engine'
import { stringUtilsModule } from '@mojir/dvala-engine'
import { collectionUtilsModule } from '@mojir/dvala-engine'
import { sequenceUtilsModule } from '@mojir/dvala-engine'
import { bitwiseUtilsModule } from '@mojir/dvala-engine'
import { convertModule } from '@mojir/dvala-engine'
import { jsonModule } from '@mojir/dvala-engine'
import { timeModule } from '@mojir/dvala-engine'
import { astModule } from '@mojir/dvala-engine'
import { handlerModule } from '@mojir/dvala-engine'
import { macrosModule } from '@mojir/dvala-engine'

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
  astModule,
  macrosModule,
]
