import {
  describe,
  expect,
  it,
} from "vitest";

import {
  compileDirectives,
} from "../../src/directives/directive.compiler";

import type {
  OptimizeEnergyRequest,
} from "../../src/schemas/request.schema";

import type {
  DirectiveInterpretations,
} from "../../src/schemas/directive.schema";

function createRequest(): OptimizeEnergyRequest {
  return {
    scenario_id: "no-op-test",

    operator_notes: [
      "This is an unrelated announcement.",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        demand_kwh: 100,
        solar_kwh: 50,
        tariff_bdt_per_kwh: 10,
      })
    ),

    battery: {
      capacity_kwh: 200,
      initial_energy_kwh: 100,
      minimum_energy_kwh: 20,
      max_charge_kwh_per_hour: 30,
      max_discharge_kwh_per_hour: 30,
    },
  };
}

describe(
  "Directive compiler - no-op",
  () => {
    it(
      "does not change any default constraint",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: false,
              directive_type:
                "no_op",
              structured_adjustment:
                null,
              explanation:
                "The note is unrelated to energy scheduling.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour
        ).toHaveLength(24);

        for (
          const hour of result.by_hour
        ) {
          expect(
            hour.solar_factor
          ).toBe(1);

          expect(
            hour.minimum_battery_energy_kwh
          ).toBe(20);

          expect(
            hour.charge_allowed
          ).toBe(true);

          expect(
            hour.discharge_allowed
          ).toBe(true);

          expect(
            hour.max_grid_kwh
          ).toBe(null);
        }
      }
    );

    it(
      "produces identical constraints when only no-op notes are supplied",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: false,
              directive_type:
                "no_op",
              structured_adjustment:
                null,
              explanation:
                "Unrelated note.",
            },
            {
              note_index: 1,
              applies: false,
              directive_type:
                "no_op",
              structured_adjustment:
                null,
              explanation:
                "Another unrelated note.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        for (
          const hour of result.by_hour
        ) {
          expect(
            hour
          ).toEqual({
            solar_factor: 1,
            minimum_battery_energy_kwh: 20,
            charge_allowed: true,
            discharge_allowed: true,
            max_grid_kwh: null,
          });
        }
      }
    );

    it(
      "does not accidentally modify a constraint because of a no-op note",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "solar_reduction",
              structured_adjustment: {
                hours: [10, 11],
                factor: 0.5,
              },
              explanation:
                "Solar is reduced.",
            },
            {
              note_index: 1,
              applies: false,
              directive_type:
                "no_op",
              structured_adjustment:
                null,
              explanation:
                "Unrelated note.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[10]
            .solar_factor
        ).toBe(0.5);

        expect(
          result.by_hour[11]
            .solar_factor
        ).toBe(0.5);

        expect(
          result.by_hour[10]
            .minimum_battery_energy_kwh
        ).toBe(20);

        expect(
          result.by_hour[10]
            .charge_allowed
        ).toBe(true);

        expect(
          result.by_hour[10]
            .discharge_allowed
        ).toBe(true);

        expect(
          result.by_hour[10]
            .max_grid_kwh
        ).toBe(null);
      }
    );
  }
);