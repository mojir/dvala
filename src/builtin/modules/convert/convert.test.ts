import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { convertModule } from './'

const dvala = createDvala({ modules: [convertModule] })

function runConvert(code: string): unknown {
  return dvala.run(`let c = import("convert"); ${code.replace(/convert:/g, 'c.')}`)
}

describe('convert module', () => {
  describe('length conversions', () => {
    it('should convert meters to feet', () => {
      expect(runConvert('convert:mToFt(1)')).toBeCloseTo(3.28084, 4)
    })

    it('should convert feet to meters', () => {
      expect(runConvert('convert:ftToM(1)')).toBeCloseTo(0.3048, 4)
    })

    it('should convert kilometers to miles', () => {
      expect(runConvert('convert:kmToMi(1)')).toBeCloseTo(0.621371, 4)
    })

    it('should convert miles to kilometers', () => {
      expect(runConvert('convert:miToKm(1)')).toBeCloseTo(1.60934, 4)
    })

    it('should convert inches to centimeters', () => {
      expect(runConvert('convert:inToCm(1)')).toBeCloseTo(2.54, 4)
    })

    it('should convert centimeters to inches', () => {
      expect(runConvert('convert:cmToIn(1)')).toBeCloseTo(0.393701, 4)
    })

    it('should convert yards to meters', () => {
      expect(runConvert('convert:ydToM(1)')).toBeCloseTo(0.9144, 4)
    })

    it('should convert nautical miles to kilometers', () => {
      expect(runConvert('convert:nmiToKm(1)')).toBeCloseTo(1.852, 4)
    })

    it('should convert millimeters to meters', () => {
      expect(runConvert('convert:mmToM(1000)')).toBeCloseTo(1, 4)
    })

    it('should handle zero', () => {
      expect(runConvert('convert:mToFt(0)')).toBe(0)
    })

    it('should handle negative values', () => {
      expect(runConvert('convert:mToFt(-1)')).toBeCloseTo(-3.28084, 4)
    })
  })

  describe('weight conversions', () => {
    it('should convert kilograms to pounds', () => {
      expect(runConvert('convert:kgToLb(1)')).toBeCloseTo(2.20462, 4)
    })

    it('should convert pounds to kilograms', () => {
      expect(runConvert('convert:lbToKg(1)')).toBeCloseTo(0.453592, 4)
    })

    it('should convert grams to ounces', () => {
      expect(runConvert('convert:gToOz(1)')).toBeCloseTo(0.035274, 4)
    })

    it('should convert ounces to grams', () => {
      expect(runConvert('convert:ozToG(1)')).toBeCloseTo(28.3495, 3)
    })

    it('should convert metric tons to kilograms', () => {
      expect(runConvert('convert:tToKg(1)')).toBe(1000)
    })

    it('should convert milligrams to grams', () => {
      expect(runConvert('convert:mgToG(1000)')).toBe(1)
    })
  })

  describe('temperature conversions', () => {
    it('should convert celsius to fahrenheit', () => {
      expect(runConvert('convert:cToF(0)')).toBeCloseTo(32, 4)
    })

    it('should convert celsius to fahrenheit (100)', () => {
      expect(runConvert('convert:cToF(100)')).toBeCloseTo(212, 4)
    })

    it('should convert fahrenheit to celsius', () => {
      expect(runConvert('convert:fToC(32)')).toBeCloseTo(0, 4)
    })

    it('should convert fahrenheit to celsius (212)', () => {
      expect(runConvert('convert:fToC(212)')).toBeCloseTo(100, 4)
    })

    it('should convert celsius to kelvin', () => {
      expect(runConvert('convert:cToK(0)')).toBeCloseTo(273.15, 4)
    })

    it('should convert kelvin to celsius', () => {
      expect(runConvert('convert:kToC(273.15)')).toBeCloseTo(0, 4)
    })

    it('should convert fahrenheit to kelvin', () => {
      expect(runConvert('convert:fToK(32)')).toBeCloseTo(273.15, 4)
    })

    it('should convert kelvin to fahrenheit', () => {
      expect(runConvert('convert:kToF(273.15)')).toBeCloseTo(32, 4)
    })

    it('should handle negative celsius', () => {
      expect(runConvert('convert:cToF(-40)')).toBeCloseTo(-40, 4)
    })

    it('should handle negative fahrenheit (equal point)', () => {
      expect(runConvert('convert:fToC(-40)')).toBeCloseTo(-40, 4)
    })
  })

  describe('volume conversions', () => {
    it('should convert liters to gallons', () => {
      expect(runConvert('convert:lToGal(1)')).toBeCloseTo(0.264172, 4)
    })

    it('should convert gallons to liters', () => {
      expect(runConvert('convert:galToL(1)')).toBeCloseTo(3.78541, 4)
    })

    it('should convert milliliters to liters', () => {
      expect(runConvert('convert:mlToL(1000)')).toBe(1)
    })

    it('should convert cups to milliliters', () => {
      expect(runConvert('convert:cupToMl(1)')).toBeCloseTo(236.588, 2)
    })

    it('should convert fluid ounces to milliliters', () => {
      expect(runConvert('convert:flOzToMl(1)')).toBeCloseTo(29.5735, 3)
    })

    it('should convert tablespoons to teaspoons', () => {
      expect(runConvert('convert:tbspToTsp(1)')).toBeCloseTo(3, 4)
    })

    it('should convert quarts to pints', () => {
      expect(runConvert('convert:qtToPt(1)')).toBeCloseTo(2, 4)
    })
  })

  describe('time conversions', () => {
    it('should convert hours to minutes', () => {
      expect(runConvert('convert:hToMin(1)')).toBe(60)
    })

    it('should convert minutes to seconds', () => {
      expect(runConvert('convert:minToS(1)')).toBe(60)
    })

    it('should convert days to hours', () => {
      expect(runConvert('convert:dayToH(1)')).toBe(24)
    })

    it('should convert weeks to days', () => {
      expect(runConvert('convert:weekToDay(1)')).toBe(7)
    })

    it('should convert milliseconds to seconds', () => {
      expect(runConvert('convert:msToS(1000)')).toBe(1)
    })

    it('should convert hours to seconds', () => {
      expect(runConvert('convert:hToS(1)')).toBe(3600)
    })
  })

  describe('area conversions', () => {
    it('should convert square meters to square feet', () => {
      expect(runConvert('convert:m2ToFt2(1)')).toBeCloseTo(10.7639, 3)
    })

    it('should convert square feet to square meters', () => {
      expect(runConvert('convert:ft2ToM2(1)')).toBeCloseTo(0.092903, 4)
    })

    it('should convert hectares to acres', () => {
      expect(runConvert('convert:hectareToAcre(1)')).toBeCloseTo(2.47105, 4)
    })

    it('should convert acres to hectares', () => {
      expect(runConvert('convert:acreToHectare(1)')).toBeCloseTo(0.404686, 4)
    })

    it('should convert square kilometers to square meters', () => {
      expect(runConvert('convert:km2ToM2(1)')).toBe(1000000)
    })

    it('should convert square inches to square centimeters', () => {
      expect(runConvert('convert:in2ToCm2(1)')).toBeCloseTo(6.4516, 4)
    })
  })

  describe('edge cases', () => {
    it('should handle large numbers', () => {
      expect(runConvert('convert:kmToMm(1)')).toBe(1000000)
    })

    it('should handle small fractions', () => {
      expect(runConvert('convert:mmToKm(1)')).toBeCloseTo(0.000001, 10)
    })

    it('should be consistent with roundtrip conversions', () => {
      const original = 42.5
      const result = runConvert(`convert:ftToM(convert:mToFt(${original}))`) as number
      expect(result).toBeCloseTo(original, 10)
    })

    it('should be consistent with temperature roundtrip', () => {
      const original = 37
      const result = runConvert(`convert:fToC(convert:cToF(${original}))`) as number
      expect(result).toBeCloseTo(original, 10)
    })
  })

  describe('speed conversions', () => {
    it('should convert mps to kmh', () => {
      expect(runConvert('convert:mpsToKmh(1)')).toBeCloseTo(3.6, 4)
    })

    it('should convert kmh to mph', () => {
      expect(runConvert('convert:kmhToMph(100)')).toBeCloseTo(62.1371, 3)
    })

    it('should convert mph to mps', () => {
      expect(runConvert('convert:mphToMps(1)')).toBeCloseTo(0.44704, 4)
    })

    it('should convert knots to kmh', () => {
      expect(runConvert('convert:knToKmh(1)')).toBeCloseTo(1.852, 3)
    })

    it('should convert fps to mps', () => {
      expect(runConvert('convert:fpsToMps(1)')).toBeCloseTo(0.3048, 4)
    })
  })

  describe('data conversions', () => {
    it('should convert kb to b', () => {
      expect(runConvert('convert:kbToB(1)')).toBe(1000)
    })

    it('should convert mb to kb', () => {
      expect(runConvert('convert:mbToKb(1)')).toBe(1000)
    })

    it('should convert gb to mb', () => {
      expect(runConvert('convert:gbToMb(1)')).toBe(1000)
    })

    it('should convert tb to gb', () => {
      expect(runConvert('convert:tbToGb(1)')).toBe(1000)
    })

    it('should convert pb to tb', () => {
      expect(runConvert('convert:pbToTb(1)')).toBe(1000)
    })
  })

  describe('pressure conversions', () => {
    it('should convert atm to pa', () => {
      expect(runConvert('convert:atmToPa(1)')).toBe(101325)
    })

    it('should convert bar to atm', () => {
      expect(runConvert('convert:barToAtm(1)')).toBeCloseTo(0.986923, 4)
    })

    it('should convert psi to kpa', () => {
      expect(runConvert('convert:psiToKpa(1)')).toBeCloseTo(6.89476, 3)
    })

    it('should convert mmhg to pa', () => {
      expect(runConvert('convert:mmhgToPa(1)')).toBeCloseTo(133.322, 2)
    })
  })

  describe('energy conversions', () => {
    it('should convert kcal to j', () => {
      expect(runConvert('convert:kcalToJ(1)')).toBe(4184)
    })

    it('should convert cal to j', () => {
      expect(runConvert('convert:calToJ(1)')).toBeCloseTo(4.184, 4)
    })

    it('should convert kwh to j', () => {
      expect(runConvert('convert:kwhToJ(1)')).toBe(3600000)
    })

    it('should convert btu to kj', () => {
      expect(runConvert('convert:btuToKj(1)')).toBeCloseTo(1.05506, 3)
    })

    it('should convert wh to cal', () => {
      expect(runConvert('convert:whToCal(1)')).toBeCloseTo(860.421, 2)
    })
  })

  describe('power conversions', () => {
    it('should convert kw to w', () => {
      expect(runConvert('convert:kwToW(1)')).toBe(1000)
    })

    it('should convert hp to w', () => {
      expect(runConvert('convert:hpToW(1)')).toBeCloseTo(745.7, 1)
    })

    it('should convert mw to kw', () => {
      expect(runConvert('convert:mwToKw(1)')).toBe(1000)
    })

    it('should convert hp to kw', () => {
      expect(runConvert('convert:hpToKw(1)')).toBeCloseTo(0.7457, 3)
    })
  })

  describe('frequency conversions', () => {
    it('should convert khz to hz', () => {
      expect(runConvert('convert:khzToHz(1)')).toBe(1000)
    })

    it('should convert mhz to khz', () => {
      expect(runConvert('convert:mhzToKhz(1)')).toBe(1000)
    })

    it('should convert ghz to mhz', () => {
      expect(runConvert('convert:ghzToMhz(1)')).toBe(1000)
    })

    it('should convert ghz to hz', () => {
      expect(runConvert('convert:ghzToHz(1)')).toBe(1000000000)
    })
  })

  describe('angle conversions', () => {
    it('should convert degrees to radians', () => {
      expect(runConvert('convert:degToRad(180)')).toBeCloseTo(Math.PI, 10)
    })

    it('should convert radians to degrees', () => {
      expect(runConvert(`convert:radToDeg(${Math.PI})`)).toBeCloseTo(180, 10)
    })

    it('should convert degrees to gradians', () => {
      expect(runConvert('convert:degToGrad(90)')).toBeCloseTo(100, 10)
    })

    it('should convert turns to degrees', () => {
      expect(runConvert('convert:turnToDeg(1)')).toBeCloseTo(360, 10)
    })

    it('should convert turns to radians', () => {
      expect(runConvert('convert:turnToRad(1)')).toBeCloseTo(2 * Math.PI, 10)
    })
  })

  describe('extra units', () => {
    it('should convert stone to kg', () => {
      expect(runConvert('convert:stToKg(1)')).toBeCloseTo(6.35029, 4)
    })

    it('should convert kg to stone', () => {
      expect(runConvert('convert:kgToSt(1)')).toBeCloseTo(0.157473, 4)
    })

    it('should convert micrometers to mm', () => {
      expect(runConvert('convert:umToMm(1000)')).toBeCloseTo(1, 10)
    })

    it('should convert angstrom to um', () => {
      expect(runConvert('convert:angstromToUm(10000)')).toBeCloseTo(1, 10)
    })

    it('should convert angstrom to m', () => {
      expect(runConvert('convert:angstromToM(1e10)')).toBeCloseTo(1, 10)
    })
  })
})
