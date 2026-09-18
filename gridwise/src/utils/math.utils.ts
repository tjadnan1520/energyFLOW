export const EPSILON = 0.01;

export function nearlyEqual(
  a: number,
  b: number,
  tolerance = EPSILON
): boolean {
  return (
    Math.abs(a - b) <=
    tolerance
  );
}

export function clamp(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

export function roundTo(
  value: number,
  decimals = 6
): number {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor
    ) / factor
  );
}

export function roundKwh(
  value: number
): number {
  return roundTo(value, 6);
}

export function roundCost(
  value: number
): number {
  return roundTo(value, 2);
}

export function sum(
  values: readonly number[]
): number {
  return values.reduce(
    (total, value) =>
      total + value,
    0
  );
}

export function max(
  values: readonly number[]
): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values);
}

export function calculateEnergyBalanceGrid(
  demandKwh: number,
  solarUsedKwh: number,
  batteryDischargeKwh: number,
  batteryChargeKwh: number
): number {
  return (
    demandKwh +
    batteryChargeKwh -
    solarUsedKwh -
    batteryDischargeKwh
  );
}

export function calculateBatteryAfter(
  batteryBeforeKwh: number,
  batteryChargeKwh: number,
  batteryDischargeKwh: number
): number {
  return (
    batteryBeforeKwh +
    batteryChargeKwh -
    batteryDischargeKwh
  );
}

export function calculateTotalCost(
  gridKwh: readonly number[],
  tariffs: readonly number[]
): number {
  if (
    gridKwh.length !==
    tariffs.length
  ) {
    throw new Error(
      "Grid and tariff arrays must have the same length"
    );
  }

  return gridKwh.reduce(
    (total, grid, index) =>
      total +
      grid * tariffs[index],
    0
  );
}

export function calculateTotalGrid(
  gridKwh: readonly number[]
): number {
  return sum(gridKwh);
}

export function calculatePeakGrid(
  gridKwh: readonly number[]
): number {
  return max(gridKwh);
}

export function percentageOf(
  percentage: number,
  value: number
): number {
  return (
    (percentage / 100) *
    value
  );
}