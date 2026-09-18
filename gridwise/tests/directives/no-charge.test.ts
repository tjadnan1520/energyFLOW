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
    scenario_id: "no-charge-test",

    operator_notes: [
      "Do not charge battery.",
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
  "Directive compiler - no charge window",
  () => {
    it(
      "disables charging during specified hours",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "no_charge_window",
              structured_adjustment: {
                hours: [12, 13, 14],
              },
              explanation:
                "Battery charging is disabled from noon to 3 PM.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[12]
            .charge_allowed
        ).toBe(false);

        expect(
          result.by_hour[13]
            .charge_allowed
        ).toBe(false);

        expect(
          result.by_hour[14]
            .charge_allowed
        ).toBe(false);
      }
    );

    it(
      "keeps charging enabled outside the restricted window",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "no_charge_window",
              structured_adjustment: {
                hours: [12, 13, 14],
              },
              explanation:
                "No charging.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[11]
            .charge_allowed
        ).toBe(true);

        expect(
          result.by_hour[15]
            .charge_allowed
        ).toBe(true);
      }
    );

    it(
      "keeps charging disabled when multiple no-charge windows overlap",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "no_charge_window",
              structured_adjustment: {
                hours: [10, 11],
              },
              explanation:
                "No charging.",
            },
            {
              note_index: 1,
              applies: true,
              directive_type:
                "no_charge_window",
              structured_adjustment: {
                hours: [11, 12],
              },
              explanation:
                "No charging.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[10]
            .charge_allowed
        ).toBe(false);

        expect(
          result.by_hour[11]
            .charge_allowed
        ).toBe(false);

        expect(
          result.by_hour[12]
            .charge_allowed
        ).toBe(false);

        expect(
          result.by_hour[13]
            .charge_allowed
        ).toBe(true);
      }
    );
  }
);