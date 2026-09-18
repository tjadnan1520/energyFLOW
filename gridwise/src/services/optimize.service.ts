import {
  optimizeEnergy,
} from "../optimizer/energy.optimizer";

import {
  interpretOperatorNotes,
} from "../llm/interpreter";

import {
  validateDirectiveInterpretations,
} from "../guardrails/directive.validator";

import {
  compileDirectives,
} from "../directives/directive.compiler";

import {
  validateOptimizationResult,
} from "../validator/plan.validator";

import {
  optimizeEnergyResponseSchema,
  type OptimizeEnergyResponse,
} from "../schemas/response.schema";

import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

export async function optimizeEnergyScenario(
  request: OptimizeEnergyRequest
): Promise<OptimizeEnergyResponse> {
  const interpretations =
    await interpretOperatorNotes(
      request
    );

  validateDirectiveInterpretations(
    request,
    interpretations
  );

  const compiledDirectives =
    compileDirectives(
      request,
      interpretations
    );

  const optimizationResult =
    await optimizeEnergy(
      request,
      compiledDirectives
    );

  validateOptimizationResult(
    request,
    compiledDirectives,
    optimizationResult
  );

  const response =
    buildResponse(
      request,
      interpretations,
      optimizationResult
    );

  const validatedResponse =
    optimizeEnergyResponseSchema.safeParse(
      response
    );

  if (
    !validatedResponse.success
  ) {
    throw new Error(
      `Final response validation failed: ${validatedResponse.error.message}`
    );
  }

  return validatedResponse.data;
}

function buildResponse(
  request: OptimizeEnergyRequest,
  interpretations: Awaited<
    ReturnType<
      typeof interpretOperatorNotes
    >
  >,
  optimizationResult: Awaited<
    ReturnType<
      typeof optimizeEnergy
    >
  >
): OptimizeEnergyResponse {
  const hourlyPlan =
    optimizationResult.hourly.map(
      (hour) => {
        const batteryAction =
          getBatteryAction(
            hour.charge_kwh,
            hour.discharge_kwh
          );

        const batteryKwh =
          getBatteryKwh(
            hour.charge_kwh,
            hour.discharge_kwh
          );

        return {
          hour: hour.hour,

          grid_kwh:
            hour.grid_kwh,

          solar_used_kwh:
            hour.solar_used_kwh,

          battery_action:
            batteryAction,

          battery_kwh:
            batteryKwh,

          battery_energy_after_kwh:
            hour.battery_energy_after_kwh,
        };
      }
    );

  return {
    scenario_id:
      request.scenario_id,

    directive_interpretation:
      interpretations,

    hourly_plan:
      hourlyPlan,

    total_grid_kwh:
      optimizationResult
        .total_grid_kwh,

    total_cost_bdt:
      optimizationResult
        .total_cost_bdt,

    peak_grid_kwh:
      optimizationResult
        .peak_grid_kwh,

    plan_summary:
      buildPlanSummary(
        request,
        optimizationResult
      ),
  };
}

function getBatteryAction(
  chargeKwh: number,
  dischargeKwh: number
):
  | "charge"
  | "discharge"
  | "idle" {
  if (chargeKwh > 1e-6) {
    return "charge";
  }

  if (dischargeKwh > 1e-6) {
    return "discharge";
  }

  return "idle";
}

function getBatteryKwh(
  chargeKwh: number,
  dischargeKwh: number
): number {
  if (chargeKwh > 1e-6) {
    return cleanNumber(
      chargeKwh
    );
  }

  if (dischargeKwh > 1e-6) {
    return cleanNumber(
      dischargeKwh
    );
  }

  return 0;
}

function buildPlanSummary(
  request: OptimizeEnergyRequest,
  optimizationResult: Awaited<
    ReturnType<
      typeof optimizeEnergy
    >
  >
): string {
  const batteryStart =
    request.battery
      .initial_energy_kwh;

  const batteryEnd =
    optimizationResult
      .hourly[23]
      .battery_energy_after_kwh;

  const chargedHours =
    optimizationResult.hourly.filter(
      (hour) =>
        hour.charge_kwh > 1e-6
    ).length;

  const dischargedHours =
    optimizationResult.hourly.filter(
      (hour) =>
        hour.discharge_kwh > 1e-6
    ).length;

  return [
    `24-hour schedule optimized for minimum grid energy cost.`,
    `Total grid import: ${cleanNumber(
      optimizationResult.total_grid_kwh
    )} kWh.`,
    `Total cost: ${cleanNumber(
      optimizationResult.total_cost_bdt
    )} BDT.`,
    `Peak grid import: ${cleanNumber(
      optimizationResult.peak_grid_kwh
    )} kWh.`,
    `Battery started at ${cleanNumber(
      batteryStart
    )} kWh and ended at ${cleanNumber(
      batteryEnd
    )} kWh.`,
    `Battery charging occurred in ${chargedHours} hour(s) and discharging occurred in ${dischargedHours} hour(s).`,
  ].join(" ");
}

function cleanNumber(
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