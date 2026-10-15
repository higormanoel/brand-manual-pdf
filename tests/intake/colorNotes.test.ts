import { expect, it } from "vitest";
import {
  encodeColorNotes,
  decodeColorNotes,
} from "../../src/studio/intake/colorNotes";
const color = { id: "ink", name: "Tinta", hex: "#123456" };
it("keeps provided color coordinates verbatim in one owned paragraph per color", () => {
  const initial = ["Observação real do cliente"];
  const first = encodeColorNotes(initial, [color], {
    ink: { rgb: "18, 52, 86", cmyk: "70 / 40 / 0 / 30 — fornecido" },
  });
  const edited = encodeColorNotes(
    first,
    [{ ...color, name: "Tinta revisada" }],
    { ink: { rgb: "18, 52, 87", cmyk: "70 / 40 / 0 / 30 — fornecido" } },
  );
  expect(edited).toEqual([
    "Observação real do cliente",
    "Coordenadas fornecidas · Tinta revisada (#123456) | RGB fornecido: 18, 52, 87 | CMYK fornecido: 70 / 40 / 0 / 30 — fornecido",
  ]);
  expect(
    decodeColorNotes(edited, [{ ...color, name: "Tinta revisada" }]),
  ).toEqual({
    ink: { rgb: "18, 52, 87", cmyk: "70 / 40 / 0 / 30 — fornecido" },
  });
});
it("does not invent coordinates when values are omitted and removes a deleted color note", () => {
  expect(encodeColorNotes([], [color], {})).toEqual([]);
  const initial = encodeColorNotes([], [color], {
    ink: { rgb: "", cmyk: "0, 0, 0, 100" },
  });
  expect(encodeColorNotes(initial, [], {})).toEqual([]);
});
