/**
 * Global numeral-system enforcement.
 *
 * Root cause: `Date`/`Number`/`Intl` formatting calls across the app pass an
 * Arabic locale (e.g. `'ar-EG'`, or no locale at all, which falls back to the
 * OS/browser locale) so users keep Arabic month/day names. In ICU, the `ar`
 * locale's *default* numbering system is `arab` (٠١٢٣٤٥٦٧٨٩), so every one of
 * those calls silently renders Arabic-Indic digits — in this app, in any
 * third-party library (charts, tables) that formats numbers/dates, and in any
 * code written in the future. There is no single call site to fix; the fix
 * has to live where every one of those calls ultimately goes through.
 *
 * Per ECMA-402, `numberingSystem` in the options object always overrides the
 * `-u-nu-*` extension embedded in the locale string, so patching the options
 * bag (rather than parsing/rewriting BCP-47 locale strings) is sufficient to
 * force Western digits while leaving language, month/day names, and RTL
 * behavior untouched.
 *
 * Import this module exactly once, before anything else, at the app entry
 * point (see src/main.tsx) so every formatting call — first-party or
 * third-party — is covered from the very first render.
 */

const LATIN_NUMERALS = 'latn';

function withLatinNumerals(options: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(options ?? {}), numberingSystem: LATIN_NUMERALS };
}

let installed = false;

export function installLatinNumeralsEnforcement(): void {
  if (installed) return;
  installed = true;

  const numberToLocaleString = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (this: number, locales?: unknown, options?: unknown) {
    return (numberToLocaleString as (...args: unknown[]) => string).call(
      this,
      locales,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  } as typeof numberToLocaleString;

  const bigIntToLocaleString = BigInt.prototype.toLocaleString;
  BigInt.prototype.toLocaleString = function (this: bigint, locales?: unknown, options?: unknown) {
    return (bigIntToLocaleString as (...args: unknown[]) => string).call(
      this,
      locales,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  } as typeof bigIntToLocaleString;

  const dateToLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (this: Date, locales?: unknown, options?: unknown) {
    return (dateToLocaleDateString as (...args: unknown[]) => string).call(
      this,
      locales,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  } as typeof dateToLocaleDateString;

  const dateToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = function (this: Date, locales?: unknown, options?: unknown) {
    return (dateToLocaleTimeString as (...args: unknown[]) => string).call(
      this,
      locales,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  } as typeof dateToLocaleTimeString;

  const dateToLocaleString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = function (this: Date, locales?: unknown, options?: unknown) {
    return (dateToLocaleString as (...args: unknown[]) => string).call(
      this,
      locales,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  } as typeof dateToLocaleString;

  const NativeNumberFormat = Intl.NumberFormat;
  function PatchedNumberFormat(locales?: unknown, options?: unknown) {
    return new NativeNumberFormat(
      locales as string | string[] | undefined,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  }
  PatchedNumberFormat.prototype = NativeNumberFormat.prototype;
  Object.setPrototypeOf(PatchedNumberFormat, NativeNumberFormat);
  // @ts-expect-error - intentional global patch of a built-in constructor
  Intl.NumberFormat = PatchedNumberFormat;

  const NativeDateTimeFormat = Intl.DateTimeFormat;
  function PatchedDateTimeFormat(locales?: unknown, options?: unknown) {
    return new NativeDateTimeFormat(
      locales as string | string[] | undefined,
      withLatinNumerals(options as Record<string, unknown> | undefined)
    );
  }
  PatchedDateTimeFormat.prototype = NativeDateTimeFormat.prototype;
  Object.setPrototypeOf(PatchedDateTimeFormat, NativeDateTimeFormat);
  // @ts-expect-error - intentional global patch of a built-in constructor
  Intl.DateTimeFormat = PatchedDateTimeFormat;
}

installLatinNumeralsEnforcement();
