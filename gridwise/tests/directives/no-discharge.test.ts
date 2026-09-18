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
    scenario_id: "no-discharge-test",

    operator_notes: [
      "Do not discharge battery.",
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
  "Directive compiler - no discharge window",
  () => {
    it(
      "disables discharging during specified hours",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "no_discharge_window",
              structured_adjustment: {
                hours: [17, 18, 19],
              },
              explanation:
                "Battery cannot discharge from 5 PM to 8 PM.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[17]
            .discharge_allowed
        ).toBe(false);

        expect(
          result.by_hour[18]
            .discharge_allowed
        ).toBe(false);

        expect(
          result.by_hour[19]
            .discharge_allowed
        ).toBe(false);
      }
    );

    it(
      "keeps discharging enabled outside the restricted window",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "no_discharge_window",
              structured_adjustment: {
                hours: [17, 18, 19],
              },
              explanation:
                "No discharge.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[16]
            .discharge_allowed
        ).toBe(true);

        expect(
          result.by_hour[20]
            .discharge_allowed
        ).toBe(true);
      }
    );

    it(
      "keeps discharging disabled for overlapping restrictions",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "no_discharge_window",
              structured_adjustment: {
                hours: [8, 9],
              },
              explanation:
                "No discharge.",
            },
            {
              note_index: 1,
              applies: true,
              directive_type:
                "no_discharge_window",
              structured_adjustment: {
                hours: [9, 10],
              },
              explanation:
                "No discharge.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[8]
            .discharge_allowed
        ).toBe(false);

        expect(
          result.by_hour[9]
            .discharge_allowed
        ).toBe(false);

        expect(
          result.by_hour[10]
            .discharge_allowed
        ).toBe(false);

        expect(
          result.by_hour[11]
            .discharge_allowed
        ).toBe(true);
      }
    );
  }
);