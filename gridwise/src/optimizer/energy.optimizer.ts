import loadHighs from "highs";

import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

import type {
  CompiledDirectives,
} from "../directives/directive.compiler";

import {
  buildEnergyModel,
  type EnergyVariableNames,
} from "./model";

export type OptimizedHour = {
  hour: number;
  grid_kwh: number;
  solar_used_kwh: number;
  charge_kwh: number;
  discharge_kwh: number;
  battery_energy_after_kwh: number;
};

export type OptimizationResult = {
  hourly: OptimizedHour[];
  total_grid_kwh: number;
  total_cost_bdt: number;
  peak_grid_kwh: number;
};

let highsPromise:
  | ReturnType<typeof loadHighs>
  | undefined;

async function getHighs() {
  if (!highsPromise) {
    highsPromise = loadHighs();
  }

  return highsPromise;
}

export async function optimizeEnergy(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives
): Promise<OptimizationResult> {
  const model =
    buildEnergyModel(
      request,
      directives
    );

  const highs =
    await getHighs();

  const result = highs.solve(
    model.lp,
    {
      output_flag: false,
      presolve: "on",
      mip_rel_gap: 0,
      time_limit: 20,
    }
  );

  if (
    result.Status !== "Optimal"
  ) {
    throw new Error(
      `HiGHS optimization failed with status: ${result.Status}`
    );
  }

  return extractOptimizationResult(
    request,
    directives,
    model.variables,
    result
  );
}

type HighsResult = {
  Status: string;
  ObjectiveValue?: number;
  Columns: Record<
    string,
    {
      Primal: number;
    }
  >;
};

function extractOptimizationResult(
  request: OptimizeEnergyRequest,
  directives: CompiledDirectives,
  variables: EnergyVariableNames[],
  result: HighsResult
): OptimizationResult {
  const hourly: OptimizedHour[] = [];

  let totalGrid = 0;
  let totalCost = 0;
  let peakGrid = 0;

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const variable =
      variables[hour];

    const grid =
      readPrimal(
        result,
        variable.grid
      );

    const charge =
      readPrimal(
        result,
        variable.charge
      );

    const discharge =
      readPrimal(
        result,
        variable.discharge
      );

    const battery =
      readPrimal(
        result,
        variable.battery
      );

    const solarUsed =
      readPrimal(
        result,
        variable.solar
      );

    const cleanedGrid =
      cleanSmallNumber(grid);

    const cleanedCharge =
      cleanSmallNumber(charge);

    const cleanedDischarge =
      cleanSmallNumber(discharge);

    const cleanedBattery =
      cleanSmallNumber(battery);

    const cleanedSolar =
      cleanSmallNumber(solarUsed);

    hourly.push({
      hour,

      grid_kwh:
        cleanedGrid,

      solar_used_kwh:
        cleanedSolar,

      charge_kwh:
        cleanedCharge,

      discharge_kwh:
        cleanedDischarge,

      battery_energy_after_kwh:
        cleanedBattery,
    });

    totalGrid +=
      cleanedGrid;

    totalCost +=
      cleanedGrid *
      request.hours[hour]
        .tariff_bdt_per_kwh;

    peakGrid = Math.max(
      peakGrid,
      cleanedGrid
    );
  }

  return {
    hourly,

    total_grid_kwh:
      cleanSmallNumber(
        totalGrid
      ),

    total_cost_bdt:
      cleanSmallNumber(
        totalCost
      ),

    peak_grid_kwh:
      cleanSmallNumber(
        peakGrid
      ),
  };
}

function readPrimal(
  result: HighsResult,
  variableName: string
): number {
  const column =
    result.Columns[
      variableName
    ];

  if (!column) {
    throw new Error(
      `HiGHS did not return variable ${variableName}`
    );
  }

  if (
    !Number.isFinite(
      column.Primal
    )
  ) {
    throw new Error(
      `HiGHS returned a non-finite value for ${variableName}`
    );
  }

  return column.Primal;
}

function cleanSmallNumber(
  value: number
): number {
  if (
    Math.abs(value) < 1e-9
  ) {
    return 0;
  }

  return Number(
    value.toFixed(10)
  );
}