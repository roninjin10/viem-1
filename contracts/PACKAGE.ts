/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets"

const foundryConfig = S.file("foundry.toml")

const srcs = S.Filegroup({
  srcs: S.glob(["src/**", "scripts/**", "foundry.toml"]),
})

// The solidity dependency libraries are git submodules; upstream,
// postinstall runs `git submodule update --init --recursive`. Submodules
// declares the trees pinned by .gitmodules as content-addressed inputs, so
// builds key on the pinned SHAs and no target needs a checkout step.
const libs = S.Git.Submodules({
  config: S.file("//.gitmodules"),
  paths: ["contracts/lib/*"],
})

// forge is a toolchain rule, not a shell line: it reads remappings and the
// profile from foundry.toml and keys the build on the solc version it
// resolves. The host bin is declared in the workspace.
const artifacts = S.Foundry.Build({
  config: foundryConfig,
  data: [srcs, libs],
  outDirs: ["out"],
})

// outFiles is the single-file dual of outDirs.
const typedArtifacts = S.Shell.Build({
  bin: S.NodeModule.Bin("bun"),
  args: ["scripts/generateTypedArtifacts.ts"],
  data: [artifacts],
  outFiles: ["generated.ts"],
})

// contracts/generated.ts is gitignored; upstream builds it on postinstall.
// The test tsconfig and the tests reference it from the working tree, so
// it materializes like force's relay artifacts.
const generated = S.Materialize(typedArtifacts)

export const Package = S.Package({
  targets: { artifacts, generated, libs, srcs },
})
