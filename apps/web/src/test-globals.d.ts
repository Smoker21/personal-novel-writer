// Vitest 3 compatibility: augment @vitest/expect (where Assertion<T> lives in Vitest 3)
// with @testing-library/jest-dom matchers.
// jest-dom@6 only augments 'vitest' module, but Vitest 3 moved Assertion to @vitest/expect.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "@vitest/expect" {
  interface Assertion<T = unknown>
    extends TestingLibraryMatchers<
      // biome-ignore lint/suspicious/noExplicitAny: matcher signature requires any
      any,
      T
    > {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<
      // biome-ignore lint/suspicious/noExplicitAny: matcher signature requires any
      any,
      // biome-ignore lint/suspicious/noExplicitAny: matcher signature requires any
      any
    > {}
}
