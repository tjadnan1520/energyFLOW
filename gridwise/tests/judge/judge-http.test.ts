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

type HourEntry = {
  hour: number;
  demand_kwh: number;
  solar_kwh: number;
  tariff_bdt_per_kwh: number;
};

function validHours(
  overrides: Partial<Record<number, Partial<HourEntry>>> = {}
): HourEntry[] {
  return Array.from(
    { length: 24 },
    (_, hour) => ({
      hour,
      demand_kwh: 100,
      solar_kwh:
        hour >= 8 && hour <= 15
          ? 80
          : 0,
      tariff_bdt_per_kwh:
        hour >= 18 && hour <= 21
          ? 20
          : 8,
      ...(overrides[hour] ?? {}),
    })
  );
}

function validRequest(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    scenario_id: "judge-http",
    operator_notes: [
      "Reduce solar to half from 13 to 15.",
    ],
    battery: {
      capacity_kwh: 200,
      initial_energy_kwh: 100,
      minimum_energy_kwh: 20,
      max_charge_kwh_per_hour: 50,
      max_discharge_kwh_per_hour: 50,
    },
    hours: validHours(),
    ...overrides,
  };
}

const validSolarInterpretation = [
  {
    note_index: 0,
    directive_type: "solar_reduction",
    applies: true,
    structured_adjustment: {
      hours: [13, 14],
      factor: 0.5,
    },
    explanation:
      "Reduce solar output to half between 13:00 and 15:00.",
  },
];

describe("judge: request validation matrix", () => {
  const cases: Array<{
    name: string;
    mutate: (
      base: Record<string, unknown>
    ) => Record<string, unknown>;
  }> = [
    {
      name: "missing scenario_id",
      mutate: (base) => {
        delete base.scenario_id;
        return base;
      },
    },
    {
      name: "empty scenario_id",
      mutate: (base) => ({
        ...base,
        scenario_id: "",
      }),
    },
    {
      name: "whitespace scenario_id",
      mutate: (base) => ({
        ...base,
        scenario_id: "   ",
      }),
    },
    {
      name: "missing operator_notes",
      mutate: (base) => {
        delete base.operator_notes;
        return base;
      },
    },
    {
      name: "zero operator notes",
      mutate: (base) => ({
        ...base,
        operator_notes: [],
      }),
    },
    {
      name: "four operator notes",
      mutate: (base) => ({
        ...base,
        operator_notes: [
          "a",
          "b",
          "c",
          "d",
        ],
      }),
    },
    {
      name: "empty operator note",
      mutate: (base) => ({
        ...base,
        operator_notes: [""],
      }),
    },
    {
      name: "whitespace operator note",
      mutate: (base) => ({
        ...base,
        operator_notes: ["   "],
      }),
    },
    {
      name: "missing hours",
      mutate: (base) => {
        delete base.hours;
        return base;
      },
    },
    {
      name: "fewer than 24 hours",
      mutate: (base) => ({
        ...base,
        hours: validHours().slice(0, 23),
      }),
    },
    {
      name: "more than 24 hours",
      mutate: (base) => ({
        ...base,
        hours: [
          ...validHours(),
          {
            hour: 23,
            demand_kwh: 100,
            solar_kwh: 0,
            tariff_bdt_per_kwh: 8,
          },
        ],
      }),
    },
    {
      name: "duplicate hours",
      mutate: (base) => {
        const hours = validHours();
        hours[5] = { ...hours[4] };
        return { ...base, hours };
      },
    },
    {
      name: "missing hour (jump from 0..22)",
      mutate: (base) => {
        const hours = validHours().filter(
          (h) => h.hour !== 11
        );
        hours.push({ ...hours[10], hour: 23 });
        hours.sort((a, b) => a.hour - b.hour);
        return { ...base, hours };
      },
    },
    {
      name: "hour -1",
      mutate: (base) => {
        const hours = validHours();
        hours[0] = { ...hours[0], hour: -1 };
        return { ...base, hours };
      },
    },
    {
      name: "hour 24",
      mutate: (base) => {
        const hours = validHours();
        hours[23] = { ...hours[23], hour: 24 };
        return { ...base, hours };
      },
    },
    {
      name: "wrong hour ordering",
      mutate: (base) => ({
        ...base,
        hours: validHours().reverse(),
      }),
    },
    {
      name: "negative demand",
      mutate: (base) => {
        const hours = validHours();
        hours[0].demand_kwh = -1;
        return { ...base, hours };
      },
    },
    {
      name: "negative solar",
      mutate: (base) => {
        const hours = validHours();
        hours[8].solar_kwh = -5;
        return { ...base, hours };
      },
    },
    {
      name: "negative tariff",
      mutate: (base) => {
        const hours = validHours();
        hours[18].tariff_bdt_per_kwh = -1;
        return { ...base, hours };
      },
    },
    {
      name: "null demand (NaN/Infinity arrive as null)",
      mutate: (base) => {
        const hours = validHours();
        hours[0].demand_kwh = null as never;
        return { ...base, hours };
      },
    },
    {
      name: "null battery",
      mutate: (base) => ({
        ...base,
        battery: null,
      }),
    },
    {
      name: "empty battery",
      mutate: (base) => ({
        ...base,
        battery: {},
      }),
    },
    {
      name: "negative battery capacity",
      mutate: (base) => ({
        ...base,
        battery: {
          ...(base.battery as object),
          capacity_kwh: -200,
        },
      }),
    },
    {
      name: "initial energy above capacity",
      mutate: (base) => ({
        ...base,
        battery: {
          ...(base.battery as object),
          initial_energy_kwh: 201,
        },
      }),
    },
    {
      name: "minimum energy above capacity",
      mutate: (base) => ({
        ...base,
        battery: {
          ...(base.battery as object),
          minimum_energy_kwh: 201,
        },
      }),
    },
    {
      name: "initial below minimum",
      mutate: (base) => ({
        ...base,
        battery: {
          ...(base.battery as object),
          initial_energy_kwh: 10,
          minimum_energy_kwh: 50,
        },
      }),
    },
    {
      name: "negative charge limit",
      mutate: (base) => ({
        ...base,
        battery: {
          ...(base.battery as object),
          max_charge_kwh_per_hour: -10,
        },
      }),
    },
    {
      name: "negative discharge limit",
      mutate: (base) => ({
        ...base,
        battery: {
          ...(base.battery as object),
          max_discharge_kwh_per_hour: -10,
        },
      }),
    },
    {
      name: "unknown properties",
      mutate: (base) => ({
        ...base,
        extra_field: "nope",
      }),
    },
    {
      name: "wrong JSON types (string demand)",
      mutate: (base) => {
        const hours = validHours();
        hours[0].demand_kwh = "100" as never;
        return { ...base, hours };
      },
    },
    {
      name: "unknown hour property",
      mutate: (base) => {
        const hours = validHours();
        (hours[0] as Record<string, unknown>).extra = 1;
        return { ...base, hours };
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      mockInterpretOperatorNotes.mockResolvedValue(
        validSolarInterpretation
      );

      const response = await request(app)
        .post("/optimize-energy")
        .send(
          testCase.mutate(validRequest())
        )
        .expect(400);

      expect(response.body.error).toBe(
        "Invalid request"
      );
      expect(
        Array.isArray(response.body.details)
      ).toBe(true);
      expect(
        response.body.details.length
      ).toBeGreaterThan(0);

      expect(mockInterpretOperatorNotes).not.toHaveBeenCalled();
    });
  }

  it("rejects malformed JSON body safely with a generic error", async () => {
    const response = await request(app)
      .post("/optimize-energy")
      .set(
        "Content-Type",
        "application/json"
      )
      .send("{ not valid json !!!");

    expect(response.status).toBeGreaterThanOrEqual(
      400
    );
    expect(
      Number.isInteger(response.status)
    ).toBe(true);
    expect(typeof response.body.error).toBe(
      "string"
    );
  });
});

describe("judge: response contract", () => {
  it("returns the exact required structure for a successful request", async () => {
    mockInterpretOperatorNotes.mockResolvedValue(
      validSolarInterpretation
    );

    const response = await request(app)
      .post("/optimize-energy")
      .send(validRequest())
      .expect(200);

    const body = response.body;

    expect(Object.keys(body).sort()).toEqual([
      "directive_interpretation",
      "hourly_plan",
      "peak_grid_kwh",
      "plan_summary",
      "scenario_id",
      "total_cost_bdt",
      "total_grid_kwh",
    ]);

    expect(body.scenario_id).toBe(
      "judge-http"
    );
    expect(
      body.directive_interpretation
    ).toEqual(validSolarInterpretation);
    expect(body.hourly_plan).toHaveLength(24);
    expect(typeof body.plan_summary).toBe(
      "string"
    );
    expect(body.plan_summary.length).toBeGreaterThan(
      0
    );
  });

  it("hours are 0..23 in ascending order", async () => {
    mockInterpretOperatorNotes.mockResolvedValue(
      validSolarInterpretation
    );

    const body = (
      await request(app)
        .post("/optimize-energy")
        .send(validRequest())
        .expect(200)
    ).body;

    expect(
      body.hourly_plan.map(
        (h: { hour: number }) => h.hour
      )
    ).toEqual(
      Array.from(
        { length: 24 },
        (_, i) => i
      )
    );
  });

  it("all numeric fields are finite, non-negative, and consistent", async () => {
    mockInterpretOperatorNotes.mockResolvedValue(
      validSolarInterpretation
    );

    const body = (
      await request(app)
        .post("/optimize-energy")
        .send(validRequest())
        .expect(200)
    ).body;

    let totalGrid = 0;
    let totalCost = 0;
    let peak = 0;

    for (const entry of body.hourly_plan) {
      for (const key of [
        "grid_kwh",
        "solar_used_kwh",
        "battery_kwh",
        "battery_energy_after_kwh",
      ]) {
        expect(Number.isFinite(entry[key])).toBe(
          true
        );
        expect(entry[key]).toBeGreaterThanOrEqual(
          0
        );
      }

      expect(
        ["charge", "discharge", "idle"]
      ).toContain(entry.battery_action);

      if (entry.battery_action === "idle") {
        expect(entry.battery_kwh).toBe(0);
      } else {
        expect(entry.battery_kwh).toBeGreaterThan(
          0
        );
      }

      totalGrid += entry.grid_kwh;
      totalCost +=
        entry.grid_kwh *
        validRequest().hours[entry.hour]
          .tariff_bdt_per_kwh;
      peak = Math.max(peak, entry.grid_kwh);
    }

    expect(body.total_grid_kwh).toBeCloseTo(
      totalGrid,
      6
    );
    expect(body.total_cost_bdt).toBeCloseTo(
      totalCost,
      6
    );
    expect(body.peak_grid_kwh).toBeCloseTo(
      peak,
      6
    );
  });

  it("applies the solar reduction to the relevant hours", async () => {
    mockInterpretOperatorNotes.mockResolvedValue(
      validSolarInterpretation
    );

    const body = (
      await request(app)
        .post("/optimize-energy")
        .send(validRequest())
        .expect(200)
    ).body;

    expect(
      body.hourly_plan[13].solar_used_kwh
    ).toBeCloseTo(40, 6);
    expect(
      body.hourly_plan[12].solar_used_kwh
    ).toBeCloseTo(80, 6);
  });
});

describe("judge: performance (mocked LLM, optimizer+validator only)", () => {
  it("measures consecutive optimize requests", async () => {
    mockInterpretOperatorNotes.mockResolvedValue(
      validSolarInterpretation
    );

    const latencies: number[] = [];

    for (let i = 0; i < 20; i++) {
      const start = performance.now();

      await request(app)
        .post("/optimize-energy")
        .send(validRequest())
        .expect(200);

      latencies.push(
        performance.now() - start
      );
    }

    latencies.sort((a, b) => a - b);
    const total = latencies.reduce(
      (s, v) => s + v,
      0
    );
    const avg = total / latencies.length;
    const p95 =
      latencies[
        Math.min(
          latencies.length - 1,
          Math.floor(latencies.length * 0.95)
        )
      ];

    console.log(
      `JUDGE_PERF mocked-LLM optimize: avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=${latencies.length}`
    );

    expect(avg).toBeLessThan(5000);
  });
});

describe("judge: health endpoint", () => {
  it("health returns 200 ok", async () => {
    const response = await request(app)
      .get("/health")
      .expect(200);

    expect(response.body).toEqual({
      status: "ok",
    });
  });
});
  describe("judge: LLM failure handling (HTTP)", () => {
  it("maps invalid JSON to a controlled generic 500", async () => {
    mockInterpretOperatorNotes.mockRejectedValue(
      new Error(
        "Gemini returned invalid JSON"
      )
    );

    const response = await request(app)
      .post("/optimize-energy")
      .send(validRequest())
      .expect(500);

    expect(response.body).toEqual({
      error: "Internal server error",
    });
  });

  it("does not leak secrets or stack traces in any failure", async () => {
    mockInterpretOperatorNotes.mockRejectedValue(
      new Error(
        "GEMINI_API_KEY=supersecret crashed at C:\\users\\app\\src\\llm\\gemini.client.ts:42"
      )
    );

    const response = await request(app)
      .post("/optimize-energy")
      .send(validRequest())
      .expect(500);

    const raw = JSON.stringify(response.body);

    expect(raw).not.toContain(
      "supersecret"
    );
    expect(raw).not.toContain("gemini");
    expect(raw).not.toContain("client.ts");
    expect(raw).not.toContain("stack");
  });

  it("maps empty output and bad note mapping to generic 500", async () => {
    const failures = [
      new Error(
        "Gemini returned invalid JSON"
      ),
      new Error(
        "Gemini returned 0 interpretations for 1 notes"
      ),
      new Error(
        "Invalid note mapping at position 0"
      ),
      new Error(
        "Gemini directive validation failed: invalid type"
      ),
    ];

    for (const failure of failures) {
      mockInterpretOperatorNotes.mockRejectedValue(
        failure
      );

      const response = await request(app)
        .post("/optimize-energy")
        .send(validRequest())
        .expect(500);

      expect(response.body.error).toBe(
        "Internal server error"
      );
    }
  });

  it("maps an infeasible optimization to a generic 500", async () => {
    const infeasibleRequest = validRequest({
      operator_notes: [
        "Cap grid at 5 kWh from 18:00 to 21:00.",
      ],
    });

    mockInterpretOperatorNotes.mockResolvedValue([
      {
        note_index: 0,
        directive_type: "max_grid_window",
        applies: true,
        structured_adjustment: {
          hours: [18, 19, 20, 21],
          max_grid_kwh: 5,
        },
        explanation:
          "Cap grid draw at 5 kWh during the evening peak.",
      },
    ]);

    const response = await request(app)
      .post("/optimize-energy")
      .send(infeasibleRequest)
      .expect(500);

    expect(response.body).toEqual({
      error: "Internal server error",
    });
  });

  it("unknown route returns 404", async () => {
    const response = await request(app)
      .get("/optimize-energy")
      .expect(404);

    expect(response.body.error).toBe(
      "Route not found"
    );
  });
});