import { meetingGoals } from "@miraio/domain";
import { describe, expect, it } from "vitest";

import { flashBriefGoldenCases } from "./flash-brief-fixtures";
import {
  buildPersonaFlashBriefCases,
  evalPersonas,
  personaFlashBriefCases,
} from "./persona-fixtures";

describe("persona fixtures", () => {
  it("expands every persona × counterpart into a case", () => {
    const expected = evalPersonas.reduce(
      (count, persona) => count + persona.counterparts.length,
      0,
    );

    expect(personaFlashBriefCases).toHaveLength(expected);
    expect(personaFlashBriefCases.length).toBeGreaterThan(0);
  });

  it("gives every case a unique name", () => {
    const names = personaFlashBriefCases.map((c) => c.caseName);

    expect(new Set(names).size).toBe(names.length);
  });

  it("does not collide with the hand-written golden set", () => {
    const goldenNames = new Set(flashBriefGoldenCases.map((c) => c.caseName));

    for (const personaCase of personaFlashBriefCases) {
      expect(goldenNames.has(personaCase.caseName)).toBe(false);
    }
  });

  it("uses only canonical meeting goals", () => {
    for (const personaCase of personaFlashBriefCases) {
      expect(meetingGoals).toContain(personaCase.input.meeting_goal);
    }
  });

  it("keeps every email address inside the .invalid space", () => {
    for (const persona of evalPersonas) {
      for (const counterpart of persona.counterparts) {
        const email = counterpart.card.email;

        if (email === null || email === undefined) continue;

        expect(email).toMatch(/\.invalid$/);
      }
    }
  });

  it("carries the persona's hallucination guards into every case", () => {
    for (const persona of evalPersonas) {
      expect(persona.forbidden_substrings.length).toBeGreaterThan(0);

      const cases = buildPersonaFlashBriefCases([persona]);

      for (const personaCase of cases) {
        for (const forbidden of persona.forbidden_substrings) {
          expect(personaCase.expectations.forbidden_substrings).toContain(
            forbidden,
          );
        }
      }
    }
  });

  it("holds identity confidence down on cards that cannot support it", () => {
    // A card with neither title nor department is the case where over-claiming
    // shows up as "wrong person" reports, so the set must contain one and it
    // must not allow a confident status.
    const thinCardCases = personaFlashBriefCases.filter(
      (personaCase) =>
        personaCase.input.card.title === null &&
        personaCase.input.card.department === null,
    );

    expect(thinCardCases.length).toBeGreaterThan(0);

    for (const personaCase of thinCardCases) {
      expect(personaCase.expectations.allowed_identity_statuses).not.toContain(
        "verified",
      );
    }
  });

  it("covers more than one locale", () => {
    const locales = new Set(personaFlashBriefCases.map((c) => c.input.locale));

    expect(locales.size).toBeGreaterThan(1);
  });
});
