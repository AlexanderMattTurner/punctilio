import * as prettier from "prettier"
import plugin from "../prettier-plugin.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE: LDQ,
  RIGHT_DOUBLE_QUOTE: RDQ,
  RIGHT_SINGLE_QUOTE: RSQ,
  EM_DASH,
  ELLIPSIS,
} = UNICODE_SYMBOLS

async function format(input: string, options: prettier.Options = {}): Promise<string> {
  return prettier.format(input, {
    parser: "markdown",
    plugins: [plugin],
    ...options,
  })
}

describe("prettier-plugin-punctilio", () => {
  it("applies smart quotes and em-dashes", async () => {
    const out = await format('"Hello" -- world.\n', { punctilioNbsp: false } as never)
    expect(out).toContain(`${LDQ}Hello${RDQ}${EM_DASH}world.`)
  })

  it("respects punctilioPunctuationStyle=british", async () => {
    const out = await format('"Hello."\n', {
      punctilioPunctuationStyle: "british",
      punctilioNbsp: false,
    } as never)
    expect(out).toContain(`${LDQ}Hello${RDQ}.`)
  })

  it("respects punctilioDashStyle=british (spaced en-dashes)", async () => {
    const out = await format("word -- word\n", {
      punctilioDashStyle: "british",
      punctilioNbsp: false,
    } as never)
    expect(out).toContain(`word ${UNICODE_SYMBOLS.EN_DASH} word`)
  })

  it("leaves code spans untouched while transforming surrounding prose", async () => {
    const out = await format('She said "hi" then ran `"foo"` happily.\n', {
      punctilioNbsp: false,
    } as never)
    expect(out).toContain('`"foo"`')
    expect(out).toContain(`said ${LDQ}hi${RDQ}`)
  })

  it("leaves fenced code blocks untouched", async () => {
    const input = ['```', '"untouched" -- still', '```', ''].join("\n")
    const out = await format(input, { punctilioNbsp: false } as never)
    expect(out).toContain('"untouched" -- still')
  })

  it("handles ellipses and apostrophes together", async () => {
    const out = await format("Wait... it's complicated.\n", {
      punctilioNbsp: false,
    } as never)
    expect(out).toContain(`Wait${ELLIPSIS} it${RSQ}s complicated.`)
  })

  it("punctilioFractions=true converts 1/2 to ½", async () => {
    const out = await format("Add 1/2 cup.\n", {
      punctilioFractions: true,
      punctilioNbsp: false,
    } as never)
    expect(out).toContain(UNICODE_SYMBOLS.FRACTION_1_2)
  })

  it("punctilioDegrees=true converts 20 C to 20 °C", async () => {
    const out = await format("It is 20 C today.\n", {
      punctilioDegrees: true,
      punctilioNbsp: false,
    } as never)
    expect(out).toContain("°C")
  })

  it("punctilioSuperscript=true converts 1st to 1ˢᵗ", async () => {
    const out = await format("1st place\n", {
      punctilioSuperscript: true,
      punctilioNbsp: false,
    } as never)
    expect(out).toContain("1ˢᵗ")
  })

  it("punctilioLigatures=true converts !? to ⁉", async () => {
    const out = await format("Wait!?\n", {
      punctilioLigatures: true,
      punctilioNbsp: false,
    } as never)
    expect(out).toContain("⁉")
  })

  it("default options apply nbsp transforms", async () => {
    const out = await format("Mr. Smith met Dr. Jones.\n", {} as never)
    expect(out).toContain(" ") // NBSP after honorifics
  })

  it("exposes choices and defaults on the options metadata", () => {
    expect(plugin.options).toBeDefined()
    const opts = plugin.options as Record<string, prettier.SupportOption>
    expect(opts.punctilioPunctuationStyle.choices).toHaveLength(5)
    expect(opts.punctilioDashStyle.default).toBe("american")
  })
})
