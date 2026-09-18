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
    scenario_id: "neutrality-test",

    operator_notes: [
      "No special operational restriction",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,

        demand_kwh:
          hour >= 18 &&
          hour <= 20
            ? 100
            : 50,

        solar_kwh:
          hour >= 8 &&
          hour <= 15
            ? 40
            : 0,

        tariff_bdt_per_kwh:
          hour >= 18 &&
          hour <= 20
            ? 25
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

function createNeutralDirectives(): CompiledDirectives {
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
  "Energy optimizer - neutrality",
  () => {
    it(
      "does not alter solar availability when no solar directive exists",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

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

          expect(
            entry.solar_used_kwh
          ).toBeLessThanOrEqual(
            input.solar_kwh + 0.01
          );
        }
      }
    );

    it(
      "does not impose an artificial grid cap",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const entry of result.hourly
        ) {
          expect(
            entry.grid_kwh
          ).toBeGreaterThanOrEqual(
            -0.01
          );
        }
      }
    );

    it(
      "returns the battery to its initial energy at the end of the day",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        const finalBattery =
          result.hourly[23]
            .battery_energy_after_kwh;

        expect(
          Math.abs(
            finalBattery -
              request.battery
                .initial_energy_kwh
          )
        ).toBeLessThanOrEqual(
          0.01
        );
      }
    );

    it(
      "maintains battery continuity between consecutive hours",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        let previousBattery =
          request.battery
            .initial_energy_kwh;

        for (
          const entry of result.hourly
        ) {
          const expectedBattery =
            previousBattery +
            entry.charge_kwh -
            entry.discharge_kwh;

          expect(
            Math.abs(
              entry.battery_energy_after_kwh -
                expectedBattery
            )
          ).toBeLessThanOrEqual(
            0.01
          );

          previousBattery =
            entry.battery_energy_after_kwh;
        }
      }
    );

    it(
      "keeps all battery states inside the configured range",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

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
            request.battery
              .minimum_energy_kwh -
              0.01
          );

          expect(
            entry.battery_energy_after_kwh
          ).toBeLessThanOrEqual(
            request.battery
              .capacity_kwh +
              0.01
          );
        }
      }
    );

    it(
      "does not create negative energy flows",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const entry of result.hourly
        ) {
          expect(
            entry.grid_kwh
          ).toBeGreaterThanOrEqual(
            -0.01
          );

          expect(
            entry.solar_used_kwh
          ).toBeGreaterThanOrEqual(
            -0.01
          );

          expect(
            entry.charge_kwh
          ).toBeGreaterThanOrEqual(
            -0.01
          );

          expect(
            entry.discharge_kwh
          ).toBeGreaterThanOrEqual(
            -0.01
          );

          expect(
            entry.battery_energy_after_kwh
          ).toBeGreaterThanOrEqual(
            -0.01
          );
        }
      }
    );

    it(
      "uses idle battery action when neither charging nor discharging",
      async () => {
        const request =
          createRequest();

        const directives =
          createNeutralDirectives();

        const result =
          await optimizeEnergy(
            request,
            directives
          );

        for (
          const entry of result.hourly
        ) {
          const hasCharge =
            entry.charge_kwh >
            0.01;

          const hasDischarge =
            entry.discharge_kwh >
            0.01;

          if (
            !hasCharge &&
            !hasDischarge
          ) {
            expect(
              entry.charge_kwh
            ).toBeLessThanOrEqual(
              0.01
            );

            expect(
              entry.discharge_kwh
            ).toBeLessThanOrEqual(
              0.01
            );
          }
        }
      }
    );
  }
);