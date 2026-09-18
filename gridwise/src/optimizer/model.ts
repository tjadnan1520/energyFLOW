import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

import type {
  CompiledDirectives,
} from "../directives/directive.compiler";

const INF = 1e30;

export type EnergyVariableNames = {
  grid: string;
  charge: string;
  discharge: string;
  battery: string;
  chargeMode: string;
  solar: string;
};

export type EnergyModel = {
  lp: string;
  variables: EnergyVariableNames[];
};

export function buildEnergyModel(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives
): EnergyModel {
  const variables =
    createVariableNames();

  const objective =
    buildObjective(
      request,
      variables
    );

  const constraints =
    buildConstraints(
      request,
      directives,
      variables
    );

  const bounds =
    buildBounds(
      request,
      directives,
      variables
    );

  const binaries =
    buildBinarySection(
      variables
    );

  const lp = [
    "Minimize",
    ` obj: ${objective}`,
    "Subject To",
    ...constraints,
    "Bounds",
    ...bounds,
    "Binaries",
    ...binaries,
    "End",
  ].join("\n");

  return {
    lp,
    variables,
  };
}

function createVariableNames(): EnergyVariableNames[] {
  return Array.from(
    { length: 24 },
    (_, hour) => ({
      grid: `grid_${hour}`,
      charge: `charge_${hour}`,
      discharge: `discharge_${hour}`,
      battery: `battery_${hour}`,
      chargeMode: `charge_mode_${hour}`,
      solar: `solar_${hour}`,
    })
  );
}

function buildObjective(
  request: OptimizeEnergyRequest,
  variables: EnergyVariableNames[]
): string {
  return request.hours
    .map(
      (hour, index) =>
        `${formatNumber(
          hour.tariff_bdt_per_kwh
        )} ${variables[index].grid}`
    )
    .join(" + ");
}

function buildConstraints(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives,
  variables: EnergyVariableNames[]
): string[] {
  const constraints: string[] = [];

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const input =
      request.hours[hour];

    const variable =
      variables[hour];

    constraints.push(
      ` balance_${hour}: ${variable.grid} + ${variable.discharge} - ${variable.charge} + ${variable.solar} = ${formatNumber(
        input.demand_kwh
      )}`
    );
  }

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const variable =
      variables[hour];

    if (hour === 0) {
      const initialEnergy =
        request.battery.initial_energy_kwh;

      constraints.push(
        ` battery_balance_${hour}: ${variable.battery} - ${variable.charge} + ${variable.discharge} = ${formatNumber(
          initialEnergy
        )}`
      );
    } else {
      const previous =
        variables[hour - 1];

      constraints.push(
        ` battery_balance_${hour}: ${variable.battery} - ${previous.battery} - ${variable.charge} + ${variable.discharge} = 0`
      );
    }
  }

  constraints.push(
    ` end_of_day_battery: ${variables[23].battery} = ${formatNumber(
      request.battery.initial_energy_kwh
    )}`
  );

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const variable =
      variables[hour];

    const constraint =
      directives.by_hour[hour];

    constraints.push(
      ` charge_mode_upper_${hour}: ${variable.charge} - ${formatNumber(
        request.battery.max_charge_kwh_per_hour
      )} ${variable.chargeMode} <= 0`
    );

    constraints.push(
      ` discharge_mode_upper_${hour}: ${variable.discharge} + ${formatNumber(
        request.battery.max_discharge_kwh_per_hour
      )} ${variable.chargeMode} <= ${formatNumber(
        request.battery.max_discharge_kwh_per_hour
      )}`
    );

    if (!constraint.charge_allowed) {
      constraints.push(
        ` no_charge_${hour}: ${variable.charge} = 0`
      );
    }

    if (!constraint.discharge_allowed) {
      constraints.push(
        ` no_discharge_${hour}: ${variable.discharge} = 0`
      );
    }

    if (
      constraint.max_grid_kwh !==
      null
    ) {
      constraints.push(
        ` max_grid_${hour}: ${variable.grid} <= ${formatNumber(
          constraint.max_grid_kwh
        )}`
      );
    }
  }

  return constraints;
}

function buildBounds(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives,
  variables: EnergyVariableNames[]
): string[] {
  const bounds: string[] = [];

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const variable =
      variables[hour];

    const constraint =
      directives.by_hour[hour];

    bounds.push(
      ` 0 <= ${variable.grid} <= ${INF}`
    );

    bounds.push(
      ` 0 <= ${variable.solar} <= ${formatNumber(
        request.hours[hour].solar_kwh *
          constraint.solar_factor
      )}`
    );

    bounds.push(
      ` 0 <= ${variable.charge} <= ${formatNumber(
        request.battery
          .max_charge_kwh_per_hour
      )}`
    );

    bounds.push(
      ` 0 <= ${variable.discharge} <= ${formatNumber(
        request.battery
          .max_discharge_kwh_per_hour
      )}`
    );

    bounds.push(
      ` ${formatNumber(
        constraint.minimum_battery_energy_kwh
      )} <= ${variable.battery} <= ${formatNumber(
        request.battery.capacity_kwh
      )}`
    );

    bounds.push(
      ` 0 <= ${variable.chargeMode} <= 1`
    );
  }

  return bounds;
}

function buildBinarySection(
  variables: EnergyVariableNames[]
): string[] {
  return variables.map(
    (variable) =>
      ` ${variable.chargeMode}`
  );
}

function formatNumber(
  value: number
): string {
  if (!Number.isFinite(value)) {
    throw new Error(
      "Cannot build optimizer model with a non-finite number"
    );
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  return Number(
    value.toFixed(12)
  ).toString();
}