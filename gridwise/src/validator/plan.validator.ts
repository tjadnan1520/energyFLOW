import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

import type {
  CompiledDirectives,
} from "../directives/directive.compiler";

import type {
  OptimizedHour,
  OptimizationResult,
} from "../optimizer/energy.optimizer";

const EPSILON = 1e-6;

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "PlanValidationError";
  }
}

export function validateOptimizationResult(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives,
  result: OptimizationResult
): void {
  validateHourCount(result);

  validateHourSequence(result);

  validateHourlyValues(result);

  validateEnergyBalance(
    request,
    directives,
    result
  );

  validateBatteryDynamics(
    request,
    result
  );

  validateBatteryLimits(
    request,
    directives,
    result
  );

  validateChargeDischargeLimits(
    request,
    result
  );

  validateDirectiveConstraints(
    directives,
    result
  );

  validateEndOfDayNeutrality(
    request,
    result
  );

  validateTotals(
    request,
    result
  );
}

function validateHourCount(
  result: OptimizationResult
): void {
  if (result.hourly.length !== 24) {
    throw new PlanValidationError(
      `Expected 24 hourly plan entries, received ${result.hourly.length}`
    );
  }
}

function validateHourSequence(
  result: OptimizationResult
): void {
  for (
    let index = 0;
    index < 24;
    index += 1
  ) {
    if (
      result.hourly[index].hour !==
      index
    ) {
      throw new PlanValidationError(
        `Invalid hourly plan order at position ${index}`
      );
    }
  }
}

function validateHourlyValues(
  result: OptimizationResult
): void {
  for (const entry of result.hourly) {
    assertFiniteNonNegative(
      entry.grid_kwh,
      `grid_kwh at hour ${entry.hour}`
    );

    assertFiniteNonNegative(
      entry.solar_used_kwh,
      `solar_used_kwh at hour ${entry.hour}`
    );

    assertFiniteNonNegative(
      entry.charge_kwh,
      `charge_kwh at hour ${entry.hour}`
    );

    assertFiniteNonNegative(
      entry.discharge_kwh,
      `discharge_kwh at hour ${entry.hour}`
    );

    assertFiniteNonNegative(
      entry.battery_energy_after_kwh,
      `battery_energy_after_kwh at hour ${entry.hour}`
    );
  }
}

function validateEnergyBalance(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives,
  result: OptimizationResult
): void {
  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const input =
      request.hours[hour];

    const plan =
      result.hourly[hour];

    const expectedSolar =
      input.solar_kwh *
      directives.by_hour[hour]
        .solar_factor;

    if (
      plan.solar_used_kwh >
      expectedSolar + EPSILON
    ) {
      throw new PlanValidationError(
        `solar_used_kwh exceeds effective solar at hour ${hour}. Available ${expectedSolar}, received ${plan.solar_used_kwh}`
      );
    }

    const supply =
      plan.grid_kwh +
      plan.solar_used_kwh +
      plan.discharge_kwh;

    const demand =
      input.demand_kwh +
      plan.charge_kwh;

    assertClose(
      supply,
      demand,
      `energy balance at hour ${hour}`
    );
  }
}

function validateBatteryDynamics(
  request: OptimizeEnergyRequest,
  result: OptimizationResult
): void {
  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const plan =
      result.hourly[hour];

    const previousEnergy =
      hour === 0
        ? request.battery
            .initial_energy_kwh
        : result.hourly[
            hour - 1
          ]
            .battery_energy_after_kwh;

    const expectedEnergy =
      previousEnergy +
      plan.charge_kwh -
      plan.discharge_kwh;

    assertClose(
      plan.battery_energy_after_kwh,
      expectedEnergy,
      `battery dynamics at hour ${hour}`
    );
  }
}

function validateBatteryLimits(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives,
  result: OptimizationResult
): void {
  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const plan =
      result.hourly[hour];

    const minimumEnergy =
      directives.by_hour[hour]
        .minimum_battery_energy_kwh;

    if (
      plan.battery_energy_after_kwh <
      minimumEnergy - EPSILON
    ) {
      throw new PlanValidationError(
        `Battery minimum violated at hour ${hour}. Expected at least ${minimumEnergy}, received ${plan.battery_energy_after_kwh}`
      );
    }

    if (
      plan.battery_energy_after_kwh >
      request.battery.capacity_kwh +
        EPSILON
    ) {
      throw new PlanValidationError(
        `Battery capacity violated at hour ${hour}. Maximum ${request.battery.capacity_kwh}, received ${plan.battery_energy_after_kwh}`
      );
    }
  }
}

function validateChargeDischargeLimits(
  request: OptimizeEnergyRequest,
  result: OptimizationResult
): void {
  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const plan =
      result.hourly[hour];

    if (
      plan.charge_kwh >
      request.battery
        .max_charge_kwh_per_hour +
        EPSILON
    ) {
      throw new PlanValidationError(
        `Maximum charge limit violated at hour ${hour}`
      );
    }

    if (
      plan.discharge_kwh >
      request.battery
        .max_discharge_kwh_per_hour +
        EPSILON
    ) {
      throw new PlanValidationError(
        `Maximum discharge limit violated at hour ${hour}`
      );
    }

    if (
      plan.charge_kwh >
        EPSILON &&
      plan.discharge_kwh >
        EPSILON
    ) {
      throw new PlanValidationError(
        `Battery cannot charge and discharge simultaneously at hour ${hour}`
      );
    }
  }
}

function validateDirectiveConstraints(
  directives: CompiledDirectives,
  result: OptimizationResult
): void {
  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const plan =
      result.hourly[hour];

    const constraint =
      directives.by_hour[hour];

    if (
      !constraint.charge_allowed &&
      plan.charge_kwh >
        EPSILON
    ) {
      throw new PlanValidationError(
        `No-charge directive violated at hour ${hour}`
      );
    }

    if (
      !constraint.discharge_allowed &&
      plan.discharge_kwh >
        EPSILON
    ) {
      throw new PlanValidationError(
        `No-discharge directive violated at hour ${hour}`
      );
    }

    if (
      constraint.max_grid_kwh !==
        null &&
      plan.grid_kwh >
        constraint.max_grid_kwh +
          EPSILON
    ) {
      throw new PlanValidationError(
        `Maximum grid limit violated at hour ${hour}. Maximum ${constraint.max_grid_kwh}, received ${plan.grid_kwh}`
      );
    }
  }
}

function validateEndOfDayNeutrality(
  request: OptimizeEnergyRequest,
  result: OptimizationResult
): void {
  const finalBattery =
    result.hourly[23]
      .battery_energy_after_kwh;

  assertClose(
    finalBattery,
    request.battery
      .initial_energy_kwh,
    "end-of-day battery neutrality"
  );
}

function validateTotals(
  request: OptimizeEnergyRequest,
  result: OptimizationResult
): void {
  let expectedTotalGrid = 0;
  let expectedTotalCost = 0;
  let expectedPeakGrid = 0;

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const plan =
      result.hourly[hour];

    expectedTotalGrid +=
      plan.grid_kwh;

    expectedTotalCost +=
      plan.grid_kwh *
      request.hours[hour]
        .tariff_bdt_per_kwh;

    expectedPeakGrid = Math.max(
      expectedPeakGrid,
      plan.grid_kwh
    );
  }

  assertClose(
    result.total_grid_kwh,
    expectedTotalGrid,
    "total_grid_kwh"
  );

  assertClose(
    result.total_cost_bdt,
    expectedTotalCost,
    "total_cost_bdt"
  );

  assertClose(
    result.peak_grid_kwh,
    expectedPeakGrid,
    "peak_grid_kwh"
  );
}

function assertFiniteNonNegative(
  value: number,
  label: string
): void {
  if (
    !Number.isFinite(value)
  ) {
    throw new PlanValidationError(
      `${label} must be finite`
    );
  }

  if (
    value < -EPSILON
  ) {
    throw new PlanValidationError(
      `${label} cannot be negative`
    );
  }
}

function assertClose(
  actual: number,
  expected: number,
  label: string
): void {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(expected)
  ) {
    throw new PlanValidationError(
      `${label} contains a non-finite value`
    );
  }

  if (
    Math.abs(
      actual - expected
    ) > EPSILON
  ) {
    throw new PlanValidationError(
      `${label} mismatch. Expected ${expected}, received ${actual}`
    );
  }
}