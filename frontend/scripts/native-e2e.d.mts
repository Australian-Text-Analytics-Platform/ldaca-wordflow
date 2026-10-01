export interface NativeTestBuild {
  identity: string;
  profile: string;
  target: string;
  binary: string;
  output: string;
  args: string[];
}
export function nativeTestBuild(profile: string, platform?: string): NativeTestBuild;
export function validateNativeTestBuild(
  build: { identity: string; profile: string; binary: string; instrumented: boolean; sha256: string },
  plan: NativeTestBuild,
  sha256: string,
): void;
