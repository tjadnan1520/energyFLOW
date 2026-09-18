import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

import type {
  DirectiveInterpretation,
  DirectiveInterpretations,
} from "../schemas/directive.schema";

export type CompiledHourConstraints = {
  solar_factor: number;
  minimum_battery_energy_kwh: number;
  charge_allowed: boolean;
  discharge_allowed: boolean;
  max_grid_kwh: number | null;
};

export type CompiledDirectives = {
  by_hour: CompiledHourConstraints[];
};

const DEFAULT_SOLAR_FACTOR = 1;

export function compileDirectives(
  request: OptimizeEnergyRequest,
  interpretations: DirectiveInterpretations
): CompiledDirectives {
  const byHour = createDefaultHourConstraints(
    request
  );

  for (const interpretation of interpretations) {
    if (!interpretation.applies) {
      continue;
    }

    applyDirective(
      request,
      byHour,
      interpretation
    );
  }

  return {
    by_hour: byHour,
  };
}

function createDefaultHourConstraints(
  request: OptimizeEnergyRequest
): CompiledHourConstraints[] {
  return request.hours.map(() => ({
    solar_factor: DEFAULT_SOLAR_FACTOR,

    minimum_battery_energy_kwh:
      request.battery.minimum_energy_kwh,

    charge_allowed: true,

    discharge_allowed: true,

    max_grid_kwh: null,
  }));
}

function applyDirective(
  request: OptimizeEnergyRequest,
  byHour: CompiledHourConstraints[],
  interpretation: Exclude<
    DirectiveInterpretation,
    {
      directive_type: "no_op";
    }
  >
): void {
  switch (
    interpretation.directive_type
  ) {
    case "solar_reduction":
      applySolarReduction(
        byHour,
        interpretation
      );
      return;

    case "minimum_battery_reserve":
      applyMinimumBatteryReserve(
        request,
        byHour,
        interpretation
      );
      return;

    case "no_charge_window":
      applyNoChargeWindow(
        byHour,
        interpretation
      );
      return;

    case "no_discharge_window":
      applyNoDischargeWindow(
        byHour,
        interpretation
      );
      return;

    case "max_grid_window":
      applyMaxGridWindow(
        byHour,
        interpretation
      );
      return;
  }
}

function applySolarReduction(
  byHour: CompiledHourConstraints[],
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "solar_reduction";
    }
  >
): void {
  const {
    hours,
    factor,
  } = interpretation.structured_adjustment;

  for (const hour of hours) {
    const constraint = byHour[hour];

    constraint.solar_factor =
      Math.min(
        constraint.solar_factor,
        factor
      );
  }
}

function applyMinimumBatteryReserve(
  request: OptimizeEnergyRequest,
  byHour: CompiledHourConstraints[],
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "minimum_battery_reserve";
    }
  >
): void {
  const {
    hours,
    minimum_energy_kwh,
  } =
    interpretation.structured_adjustment;

  const effectiveMinimum = Math.max(
    request.battery.minimum_energy_kwh,
    minimum_energy_kwh
  );

  for (const hour of hours) {
    const constraint = byHour[hour];

    constraint.minimum_battery_energy_kwh =
      Math.max(
        constraint.minimum_battery_energy_kwh,
        effectiveMinimum
      );
  }
}

function applyNoChargeWindow(
  byHour: CompiledHourConstraints[],
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "no_charge_window";
    }
  >
): void {
  const {
    hours,
  } = interpretation.structured_adjustment;

  for (const hour of hours) {
    byHour[hour].charge_allowed =
      false;
  }
}

function applyNoDischargeWindow(
  byHour: CompiledHourConstraints[],
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "no_discharge_window";
    }
  >
): void {
  const {
    hours,
  } = interpretation.structured_adjustment;

  for (const hour of hours) {
    byHour[hour].discharge_allowed =
      false;
  }
}

function applyMaxGridWindow(
  byHour: CompiledHourConstraints[],
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "max_grid_window";
    }
  >
): void {
  const {
    hours,
    max_grid_kwh,
  } =
    interpretation.structured_adjustment;

  for (const hour of hours) {
    const constraint = byHour[hour];

    if (
      constraint.max_grid_kwh === null
    ) {
      constraint.max_grid_kwh =
        max_grid_kwh;
    } else {
      constraint.max_grid_kwh =
        Math.min(
          constraint.max_grid_kwh,
          max_grid_kwh
        );
    }
  }
}