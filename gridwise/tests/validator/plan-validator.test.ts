import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateOptimizationResult,
  PlanValidationError,
} from "../../src/validator/plan.validator";

import type {
  OptimizeEnergyRequest,
} from "../../src/schemas/request.schema";

import type {
  CompiledDirectives,
} from "../../src/directives/directive.compiler";

import type {
  OptimizedHour,
  OptimizationResult,
} from "../../src/optimizer/energy.optimizer";

function createRequest(): OptimizeEnergyRequest {
  return {
    scenario_id: "validator-test",

    operator_notes: [
      "Test operator note",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,

        demand_kwh:
          hour >= 18 &&
          hour <= 20
            ? 150
            : 100,

        solar_kwh:
          hour >= 8 &&
          hour <= 15
            ? 50
            : 0,

        tariff_bdt_per_kwh:
          hour >= 18 &&
          hour <= 20
            ? 20
            : 8,
      })
    ),

    battery: {
      capacity_kwh: 100,
      initial_energy_kwh: 50,
      minimum_energy_kwh: 20,
      max_charge_kwh_per_hour: 30,
      max_discharge_kwh_per_hour: 30,
    },
  };
}

function createDirectives(): CompiledDirectives {
  return {
    by_hour: Array.from(
      { length: 24 },
      () => ({
        solar_factor: 1,
        minimum_battery_energy_kwh: 20,
        charge_allowed: true,
        discharge_allowed: true,
        max_grid_kwh: null,
      })
    ),
  };
}

function createValidHourlyPlan(): OptimizedHour[] {
  return Array.from(
    { length: 24 },
    (_, hour) => ({
      hour,

      grid_kwh:
        hour >= 8 &&
        hour <= 15
          ? 50
          : hour >= 18 &&
            hour <= 20
            ? 150
            : 100,

      solar_used_kwh:
        hour >= 8 &&
        hour <= 15
          ? 50
          : 0,

      charge_kwh: 0,

      discharge_kwh: 0,

      battery_energy_after_kwh: 50,
    })
  );
}

function createValidResult(): OptimizationResult {
  const hourly =
    createValidHourlyPlan();

  const totalGrid =
    hourly.reduce(
      (total, hour) =>
        total + hour.grid_kwh,
      0
    );

  const totalCost =
    hourly.reduce(
      (total, hour) => {
        const tariff =
          createRequest()
            .hours[hour.hour]
            .tariff_bdt_per_kwh;

        return (
          total +
          hour.grid_kwh * tariff
        );
      },
      0
    );

  const peakGrid =
    Math.max(
      ...hourly.map(
        (hour) =>
          hour.grid_kwh
      )
    );

  return {
    hourly,

    total_grid_kwh:
      totalGrid,

    total_cost_bdt:
      totalCost,

    peak_grid_kwh:
      peakGrid,
  };
}

function expectValidationError(
  fn: () => void
): void {
  expect(fn).toThrow(
    PlanValidationError
  );
}

describe(
  "Plan validator",
  () => {
    it(
      "accepts a valid optimization result",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        expect(() =>
          validateOptimizationResult(
            request,
            directives,
            result
          )
        ).not.toThrow();
      }
    );

    it(
      "rejects a plan with fewer than 24 hours",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly =
          result.hourly.slice(0, 23);

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects a plan with more than 24 hours",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly.push({
          hour: 24,
          grid_kwh: 0,
          solar_used_kwh: 0,
          charge_kwh: 0,
          discharge_kwh: 0,
          battery_energy_after_kwh: 50,
        });

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects incorrect hour ordering",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        const first =
          result.hourly[0];

        result.hourly[0] =
          result.hourly[1];

        result.hourly[1] =
          first;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects negative grid energy",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[5]
          .grid_kwh = -1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects negative solar usage",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .solar_used_kwh = -1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects negative battery charge",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .charge_kwh = -1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects negative battery discharge",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .discharge_kwh = -1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects solar usage above available solar",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .solar_used_kwh = 60;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects solar usage above effective solar after reduction",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[10].solar_factor =
          0.2;

        const result =
          createValidResult();

        result.hourly[10]
          .solar_used_kwh = 20;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "accepts solar usage within reduced solar availability",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[10].solar_factor =
          0.2;

        const result =
          createValidResult();

        result.hourly[10]
          .solar_used_kwh = 10;

        result.hourly[10]
          .grid_kwh = 90;

        result.total_grid_kwh =
          result.hourly.reduce(
            (total, entry) =>
              total +
              entry.grid_kwh,
            0
          );

        result.total_cost_bdt =
          result.hourly.reduce(
            (total, entry) =>
              total +
              entry.grid_kwh *
                request.hours[
                  entry.hour
                ]
                  .tariff_bdt_per_kwh,
            0
          );

        result.peak_grid_kwh =
          Math.max(
            ...result.hourly.map(
              (entry) =>
                entry.grid_kwh
            )
          );

        expect(() =>
          validateOptimizationResult(
            request,
            directives,
            result
          )
        ).not.toThrow();
      }
    );

    it(
      "rejects battery energy above capacity",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .battery_energy_after_kwh = 101;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects battery energy below minimum",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .battery_energy_after_kwh = 19;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects battery charge above hourly limit",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .charge_kwh = 31;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects battery discharge above hourly limit",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .discharge_kwh = 31;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects charging during a no-charge window",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[10].charge_allowed =
          false;

        const result =
          createValidResult();

        result.hourly[10]
          .charge_kwh = 10;

        result.hourly[10]
          .battery_energy_after_kwh = 60;

        result.hourly[10]
          .grid_kwh = 110;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "accepts zero charging during a no-charge window",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[10].charge_allowed =
          false;

        const result =
          createValidResult();

        expect(() =>
          validateOptimizationResult(
            request,
            directives,
            result
          )
        ).not.toThrow();
      }
    );

    it(
      "rejects discharging during a no-discharge window",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[10].discharge_allowed =
          false;

        const result =
          createValidResult();

        result.hourly[10]
          .discharge_kwh = 10;

        result.hourly[10]
          .battery_energy_after_kwh = 40;

        result.hourly[10]
          .grid_kwh = 40;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "accepts zero discharge during a no-discharge window",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[10].discharge_allowed =
          false;

        const result =
          createValidResult();

        expect(() =>
          validateOptimizationResult(
            request,
            directives,
            result
          )
        ).not.toThrow();
      }
    );

    it(
      "rejects grid usage above an applicable grid cap",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[0].max_grid_kwh =
          99;

        const result =
          createValidResult();

        result.hourly[0]
          .grid_kwh = 100;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "accepts grid usage exactly at the grid cap",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives
          .by_hour[0].max_grid_kwh =
          100;

        const result =
          createValidResult();

        result.hourly[0]
          .grid_kwh = 100;

        expect(() =>
          validateOptimizationResult(
            request,
            directives,
            result
          )
        ).not.toThrow();
      }
    );

    it(
      "rejects incorrect battery state transition",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .charge_kwh = 10;

        result.hourly[10]
          .battery_energy_after_kwh = 50;

        result.hourly[10]
          .grid_kwh = 110;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects incorrect energy balance",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .grid_kwh = 1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects incorrect final battery energy",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[23]
          .battery_energy_after_kwh = 40;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects incorrect total grid",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.total_grid_kwh += 1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects incorrect total cost",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.total_cost_bdt += 1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects incorrect peak grid value",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.peak_grid_kwh += 1;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects NaN values",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .grid_kwh = NaN;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );

    it(
      "rejects infinite values",
      () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          createValidResult();

        result.hourly[10]
          .grid_kwh = Infinity;

        expectValidationError(
          () =>
            validateOptimizationResult(
              request,
              directives,
              result
            )
        );
      }
    );
  }
);