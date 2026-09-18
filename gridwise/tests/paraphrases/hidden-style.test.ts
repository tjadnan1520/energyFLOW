import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import request from "supertest";

const {
  mockInterpretOperatorNotes,
} = vi.hoisted(() => ({
  mockInterpretOperatorNotes:
    vi.fn(),
}));

vi.mock(
  "../../src/llm/interpreter",
  () => ({
    interpretOperatorNotes:
      mockInterpretOperatorNotes,
  })
);

import app from "../../src/app";

type Directive = {
  note_index: number;
  applies: boolean;
  directive_type:
    | "solar_reduction"
    | "minimum_battery_reserve"
    | "no_charge_window"
    | "no_discharge_window"
    | "max_grid_window"
    | "no_op";

  structured_adjustment:
    | {
        hours: number[];
        factor?: number;
        minimum_energy_kwh?: number;
        max_grid_kwh?: number;
      }
    | null;

  explanation: string;
};

function createHours() {
  return Array.from(
    { length: 24 },
    (_, hour) => ({
      hour,
      demand_kwh:
        hour >= 18 && hour <= 21
          ? 180
          : 100,
      solar_kwh:
        hour >= 8 && hour <= 15
          ? 100
          : 0,
      tariff_bdt_per_kwh:
        hour >= 18 && hour <= 21
          ? 20
          : 8,
    })
  );
}

function createRequest(
  operatorNotes: string[]
) {
  return {
    scenario_id:
      "hidden-style-test",

    operator_notes:
      operatorNotes,

    hours:
      createHours(),

    battery: {
      capacity_kwh: 200,
      initial_energy_kwh: 100,
      minimum_energy_kwh: 20,
      max_charge_kwh_per_hour: 50,
      max_discharge_kwh_per_hour: 50,
    },
  };
}

function expectValidResponse(
  response: request.Response
) {
  expect(
    response.status
  ).toBe(200);

  expect(
    response.body
      .directive_interpretation
  ).toHaveLength(
    response.body
      .directive_interpretation
      .length
  );

  expect(
    response.body.hourly_plan
  ).toHaveLength(24);

  expect(
    response.body.hourly_plan.map(
      (entry: { hour: number }) =>
        entry.hour
    )
  ).toEqual(
    Array.from(
      { length: 24 },
      (_, index) => index
    )
  );

  expect(
    response.body.total_grid_kwh
  ).toBeGreaterThanOrEqual(0);

  expect(
    response.body.total_cost_bdt
  ).toBeGreaterThanOrEqual(0);

  expect(
    response.body.peak_grid_kwh
  ).toBeGreaterThanOrEqual(0);

  expect(
    typeof response.body.plan_summary
  ).toBe("string");
}

describe(
  "GridWise hidden-style paraphrase tests",
  () => {
    it(
      "handles paraphrased solar reduction",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "solar_reduction",
            structured_adjustment: {
              hours: [13, 14],
              factor: 0.2,
            },
            explanation:
              "Solar availability is reduced to 20 percent during hours 13 and 14.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "Panel maintenance from 1 to 3 PM will leave only about one-fifth of normal PV output.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
        ).toEqual([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "solar_reduction",
            structured_adjustment: {
              hours: [13, 14],
              factor: 0.2,
            },
            explanation:
              "Solar availability is reduced to 20 percent during hours 13 and 14.",
          },
        ]);
      }
    );

    it(
      "handles paraphrased battery reserve instruction",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "minimum_battery_reserve",
            structured_adjustment: {
              hours: [18, 19, 20],
              minimum_energy_kwh: 100,
            },
            explanation:
              "Battery energy must stay at or above 100 kWh during the evening window.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "Keep half of the storage capacity untouched from 6 PM through 9 PM.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
        ).toEqual([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "minimum_battery_reserve",
            structured_adjustment: {
              hours: [18, 19, 20],
              minimum_energy_kwh: 100,
            },
            explanation:
              "Battery energy must stay at or above 100 kWh during the evening window.",
          },
        ]);
      }
    );

    it(
      "handles paraphrased no-charge instruction",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "no_charge_window",
            structured_adjustment: {
              hours: [12, 13, 14],
            },
            explanation:
              "Battery charging is unavailable during hours 12 through 14.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "Do not put any energy into the battery between noon and 3 PM.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
        ).toEqual([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "no_charge_window",
            structured_adjustment: {
              hours: [12, 13, 14],
            },
            explanation:
              "Battery charging is unavailable during hours 12 through 14.",
          },
        ]);
      }
    );

    it(
      "handles paraphrased no-discharge instruction",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "no_discharge_window",
            structured_adjustment: {
              hours: [17, 18, 19],
            },
            explanation:
              "Battery discharge is blocked during hours 17 through 19.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "Keep the storage from supplying load during the 5 PM to 8 PM period.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
        ).toEqual([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "no_discharge_window",
            structured_adjustment: {
              hours: [17, 18, 19],
            },
            explanation:
              "Battery discharge is blocked during hours 17 through 19.",
          },
        ]);
      }
    );

    it(
      "handles paraphrased grid cap instruction",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "max_grid_window",
            structured_adjustment: {
              hours: [18, 19, 20],
              max_grid_kwh: 160,
            },
            explanation:
              "Grid import must remain at or below 160 kWh during the evening window.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "From 6 until 9 PM, grid supply must never exceed 160 kWh in an hour.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
        ).toEqual([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "max_grid_window",
            structured_adjustment: {
              hours: [18, 19, 20],
              max_grid_kwh: 160,
            },
            explanation:
              "Grid import must remain at or below 160 kWh during the evening window.",
          },
        ]);
      }
    );

    it(
      "handles irrelevant paraphrased note as no_op",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: false,
            directive_type:
              "no_op",
            structured_adjustment:
              null,
            explanation:
              "The note does not change the energy schedule.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "The campus security meeting has been moved to Thursday.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
        ).toEqual([
          {
            note_index: 0,
            applies: false,
            directive_type:
              "no_op",
            structured_adjustment:
              null,
            explanation:
              "The note does not change the energy schedule.",
          },
        ]);
      }
    );

    it(
      "preserves note order for multiple paraphrased notes",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
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
              "Solar availability is halved during hours 10 and 11.",
          },
          {
            note_index: 1,
            applies: true,
            directive_type:
              "no_charge_window",
            structured_adjustment: {
              hours: [12, 13],
            },
            explanation:
              "Battery charging is unavailable during hours 12 and 13.",
          },
          {
            note_index: 2,
            applies: true,
            directive_type:
              "max_grid_window",
            structured_adjustment: {
              hours: [18, 19],
              max_grid_kwh: 130,
            },
            explanation:
              "Grid import is capped at 130 kWh during hours 18 and 19.",
          },
        ] satisfies Directive[]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "PV output will be roughly half normal between 10 AM and noon.",
                "The battery must not accept charge from noon until 2 PM.",
                "During the first two evening peak hours, draw no more than 130 kWh from the grid.",
              ])
            );

        expectValidResponse(
          response
        );

        expect(
          response.body
            .directive_interpretation
            .map(
              (
                directive: Directive
              ) =>
                directive.note_index
            )
        ).toEqual([
          0,
          1,
          2,
        ]);

        expect(
          response.body
            .directive_interpretation
            .map(
              (
                directive: Directive
              ) =>
                directive.directive_type
            )
        ).toEqual([
          "solar_reduction",
          "no_charge_window",
          "max_grid_window",
        ]);
      }
    );

    it(
      "rejects an invalid directive interpretation from the interpreter",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "solar_reduction",
            structured_adjustment: {
              hours: [15, 14],
              factor: 0.2,
            },
            explanation:
              "Invalid descending hours.",
          },
        ]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "Solar output falls during the afternoon.",
              ])
            );

        expect(
          response.status
        ).toBe(500);

        expect(
          response.body
        ).toEqual({
          error: "Internal server error",
        });
      }
    );

    it(
      "rejects a zero-hour directive window",
      async () => {
        mockInterpretOperatorNotes.mockReset();

        mockInterpretOperatorNotes.mockResolvedValue([
          {
            note_index: 0,
            applies: true,
            directive_type:
              "no_charge_window",
            structured_adjustment: {
              hours: [],
            },
            explanation:
              "Invalid empty window.",
          },
        ]);

        const response =
          await request(app)
            .post(
              "/optimize-energy"
            )
            .send(
              createRequest([
                "Do not charge during the specified period.",
              ])
            );

        expect(
          response.status
        ).toBe(500);

        expect(
          response.body
        ).toEqual({
          error: "Internal server error",
        });
      }
    );
  }
);