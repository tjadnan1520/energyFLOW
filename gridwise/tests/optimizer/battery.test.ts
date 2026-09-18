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
    scenario_id: "battery-test",

    operator_notes: [
      "Battery test",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,

        demand_kwh: 50,

        solar_kwh:
          hour >= 10 &&
          hour <= 14
            ? 50
            : 0,

        tariff_bdt_per_kwh:
          hour >= 18 &&
          hour <= 20
            ? 30
            : 5,
      })
    ),

    battery: {
      capacity_kwh: 100,

      initial_energy_kwh: 50,

      minimum_energy_kwh: 20,

      max_charge_kwh_per_hour: 20,

      max_discharge_kwh_per_hour: 20,
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

describe(
  "Energy optimizer - battery constraints",
  () => {
    it(
      "keeps battery energy within capacity",
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
          expect(
            entry.battery_energy_after_kwh
          ).toBeLessThanOrEqual(
            request.battery.capacity_kwh +
              0.01
          );
        }
      }
    );

    it(
      "keeps battery energy above the base minimum",
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
          expect(
            entry.battery_energy_after_kwh
          ).toBeGreaterThanOrEqual(
            request.battery.minimum_energy_kwh -
              0.01
          );
        }
      }
    );

    it(
      "does not exceed the hourly charge limit",
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
          expect(
            entry.charge_kwh
          ).toBeLessThanOrEqual(
            request.battery
              .max_charge_kwh_per_hour +
              0.01
          );
        }
      }
    );

    it(
      "does not exceed the hourly discharge limit",
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
          expect(
            entry.discharge_kwh
          ).toBeLessThanOrEqual(
            request.battery
              .max_discharge_kwh_per_hour +
              0.01
          );
        }
      }
    );

    it(
      "respects a higher minimum battery reserve directive",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        for (
          const hour of [
            18,
            19,
            20,
          ]
        ) {
          directives.by_hour[
            hour
          ].minimum_battery_energy_kwh =
            60;
        }

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const hour of [
            18,
            19,
            20,
          ]
        ) {
          const entry =
            result.hourly[hour];

          expect(
            entry.battery_energy_after_kwh
          ).toBeGreaterThanOrEqual(
            59.99
          );
        }
      }
    );

    it(
      "does not charge during a restricted charge hour",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives.by_hour[12]
          .charge_allowed = false;

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        expect(
          result.hourly[12]
            .charge_kwh
        ).toBeLessThanOrEqual(
          0.01
        );
      }
    );

    it(
      "does not discharge during a restricted discharge hour",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives.by_hour[18]
          .discharge_allowed = false;

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        expect(
          result.hourly[18]
            .discharge_kwh
        ).toBeLessThanOrEqual(
          0.01
        );
      }
    );

    it(
      "respects a solar reduction directive",
      async () => {
        const request =
          createRequest();

        const directives =
          createDirectives();

        directives.by_hour[12]
          .solar_factor = 0.2;

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        expect(
          result.hourly[12]
            .solar_used_kwh
        ).toBeLessThanOrEqual(
          50 * 0.2 + 0.01
        );
      }
    );
  }
);
