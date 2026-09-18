import {
  describe,
  expect,
  it,
} from "vitest";

import {
  optimizeEnergy,
} from "../../src/optimizer/energy.optimizer";

import type {
  OptimizeEnergyRequest,
} from "../../src/schemas/request.schema";

import type {
  CompiledDirectives,
} from "../../src/directives/directive.compiler";

function createRequest(): OptimizeEnergyRequest {
  return {
    scenario_id: "energy-balance-test",

    operator_notes: [
      "Test note",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,

        demand_kwh:
          hour === 18
            ? 100
            : 50,

        solar_kwh:
          hour >= 8 &&
          hour <= 15
            ? 30
            : 0,

        tariff_bdt_per_kwh:
          hour === 18
            ? 20
            : 5,
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

        max_grid_kwh: Infinity,
      })
    ),
  };
}

describe(
  "Energy optimizer - energy balance",
  () => {
    it(
      "returns 24 hourly optimization entries",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        expect(
          result.hourly
        ).toHaveLength(24);

        expect(
          result.hourly.map(
            (entry) => entry.hour
          )
        ).toEqual(
          Array.from(
            { length: 24 },
            (_, hour) => hour
          )
        );
      }
    );

    it(
      "satisfies energy balance for every hour",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const entry of result.hourly
        ) {
          const input =
            request.hours[
              entry.hour
            ];

          const lhs =
            entry.grid_kwh +
            entry.solar_used_kwh +
            entry.discharge_kwh;

          const rhs =
            input.demand_kwh +
            entry.charge_kwh;

          expect(
            Math.abs(lhs - rhs)
          ).toBeLessThanOrEqual(
            0.01
          );
        }
      }
    );

    it(
      "never uses more solar than available solar",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const entry of result.hourly
        ) {
          const input =
            request.hours[
              entry.hour
            ];

          const constraint =
            directives.by_hour[
              entry.hour
            ];

          const effectiveSolar =
            input.solar_kwh *
            constraint.solar_factor;

          expect(
            entry.solar_used_kwh
          ).toBeLessThanOrEqual(
            effectiveSolar + 0.01
          );
        }
      }
    );

    it(
      "uses solar when it is available instead of unnecessarily importing equivalent grid energy",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const entry of result.hourly
        ) {
          const input =
            request.hours[
              entry.hour
            ];

          if (
            input.solar_kwh > 0
          ) {
            expect(
              entry.solar_used_kwh
            ).toBeGreaterThanOrEqual(
              Math.min(
                input.demand_kwh,
                input.solar_kwh
              ) - 0.01
            );
          }
        }
      }
    );

    it(
      "calculates total grid usage from hourly values",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        const expectedTotalGrid =
          result.hourly.reduce(
            (total, entry) =>
              total +
              entry.grid_kwh,
            0
          );

        expect(
          Math.abs(
            result.total_grid_kwh -
              expectedTotalGrid
          )
        ).toBeLessThanOrEqual(
          0.01
        );
      }
    );

    it(
      "calculates total cost from hourly grid usage and tariff",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        const expectedCost =
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

        expect(
          Math.abs(
            result.total_cost_bdt -
              expectedCost
          )
        ).toBeLessThanOrEqual(
          0.01
        );
      }
    );

    it(
      "calculates peak grid usage correctly",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        const expectedPeak =
          Math.max(
            ...result.hourly.map(
              (entry) =>
                entry.grid_kwh
            )
          );

        expect(
          Math.abs(
            result.peak_grid_kwh -
              expectedPeak
          )
        ).toBeLessThanOrEqual(
          0.01
        );
      }
    );
  }
);