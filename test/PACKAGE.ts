/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets"
import { Package as contracts } from "../contracts/PACKAGE.js"
import { Package as src } from "../src/PACKAGE.js"

const vitestConfig = S.file("vitest.config.ts")

// test/tempo is a git submodule (the tempo node's own repo).
const tempoSubmodule = S.Git.Submodules({
  config: S.file("//.gitmodules"),
  paths: ["test/tempo"],
})

const infra = S.Filegroup({
  srcs: S.glob(["**", "!tempo/**"]),
})

// A forked Ethereum node is a service with content-addressed state: the
// tuple (anvil version, forkUrl, forkBlockNumber, port) keys the service,
// so tests keyed on a pinned fork block are hermetic and their results
// cache like builds. The secret carries the private RPC; fallback is the
// public endpoint test/src/anvil.ts already defaults to.
const anvilMainnet = S.Anvil.Fork({
  forkUrl: S.Secret("VITE_ANVIL_FORK_URL", {
    fallback: "https://ethereum.reth.rs/rpc",
  }),
  forkBlockNumber: 22263623,
  port: 8545,
})

// The public Sepolia RPC prunes state within hours, so a pinned block ages
// out. forkBlockNumber "latest" opts this service out of content
// addressing; targets that use it are never cache hits.
const anvilSepolia = S.Anvil.Fork({
  forkUrl: S.Secret("VITE_ANVIL_FORK_URL_SEPOLIA", {
    fallback: "https://rpc.sepolia.ethpandaops.io",
  }),
  forkBlockNumber: "latest",
  port: 8845,
})

const anvilOptimism = S.Anvil.Fork({
  forkUrl: S.Secret("VITE_ANVIL_FORK_URL_OPTIMISM", {
    fallback: "https://mainnet.optimism.io",
  }),
  forkBlockNumber: 147000000,
  port: 8645,
})

const anvilZksync = S.Anvil.Fork({
  forkUrl: S.Secret("VITE_ANVIL_FORK_URL_ZKSYNC", {
    fallback: "https://mainnet.era.zksync.io",
  }),
  forkBlockNumber: "latest",
  port: 8745,
})

// The tempo localnet runs in docker (upstream uses testcontainers). Tag
// pins come from the CI hardfork matrix. The zone sidecar is resolved
// inside the setup script today; it becomes a second Docker.Service when
// extracted.
const tempoNode = (tag: string) => {
  return S.Docker.Service({
    image: "ghcr.io/tempoxyz/tempo",
    tag,
  })
}

// shards fans one logical target into N cached executions; the CI shard
// matrix falls out of the graph instead of being spelled in YAML. The
// multicall axis is a plain function, like whatsabi's provider matrix.
const coreTest = (multicall: "true" | "false") => {
  return S.Shell.Test({
    bin: S.NodeModule.Bin("vitest"),
    args: ["run", "--config", "test/vitest.config.ts", "--project", "core", "--bail", "1"],
    env: {
      VITE_BATCH_MULTICALL: multicall,
      VITE_NETWORK_TRANSPORT_MODE: "http",
    },
    data: [src.srcs, src.tests, infra, contracts.generated, vitestConfig],
    services: [anvilMainnet, anvilSepolia, anvilOptimism, anvilZksync],
    shards: 3,
  })
}

const test = coreTest("true")

const testNoMulticall = coreTest("false")

const tempoTest = (hardfork: string, tag: string) => {
  return S.Shell.Test({
    bin: S.NodeModule.Bin("vitest"),
    args: ["run", "--config", "test/vitest.config.ts", "--project", "tempo", "--bail", "1"],
    env: {
      VITE_TEMPO_ENV: "localnet",
      VITE_TEMPO_HARDFORK: hardfork,
      VITE_TEMPO_ZONES: "true",
    },
    data: [src.srcs, src.tests, infra, tempoSubmodule, vitestConfig],
    services: [tempoNode(tag)],
    shards: 3,
  })
}

// Digest pins from the CI hardfork matrix: T10 is frozen, Tnext floats.
const testTempo = tempoTest(
  "T10",
  "sha256:af7a8955370adc4868a3237352ceded3bd917702a14758796eab86b338b75e49",
)

const testTempoNext = tempoTest("Tnext", "latest")

const testTempoMultisig = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "--config", "test/vitest.config.ts", "--project", "tempo-multisig", "--bail", "1"],
  env: {
    VITE_TEMPO_ENV: "localnet",
    VITE_TEMPO_MULTISIG: "true",
    VITE_TEMPO_TAG: "sha-7825976",
  },
  data: [src.srcs, src.tests, infra, tempoSubmodule, vitestConfig],
  services: [tempoNode("sha-7825976")],
})

// Model fuzzing needs no node; the node-fuzz variant replays the fuzz
// cases against the docker localnet.
const testTempoFuzz = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "--config", "test/vitest.config.ts", "--project", "tempo-fuzz"],
  env: { TEST_TEMPO_FUZZ: "true", FUZZ_RUNS: "500" },
  data: [src.srcs, src.tests, infra, vitestConfig],
})

const testTempoFuzzNode = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "--config", "test/vitest.config.ts", "--project", "tempo-fuzz-node"],
  env: {
    TEST_TEMPO_FUZZ: "true",
    VITE_TEMPO_BLOCK_TIME: "50ms",
    VITE_TEMPO_INSTANCE_ID: "1",
  },
  data: [src.srcs, src.tests, infra, vitestConfig],
  services: [tempoNode("latest")],
})

// End-to-end against the deployed testnet: not hermetic by definition, so
// it is a network target with credentials, kept out of the local suites.
const testTempoDeployed = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "--config", "test/vitest.config.ts", "--project", "tempo", "--bail", "1", "e2e"],
  env: { VITE_TEMPO_ENV: "testnet" },
  data: [src.srcs, src.tests, infra, vitestConfig],
  secrets: [S.Secret("VITE_TEMPO_CREDENTIALS")],
  sandbox: { network: true },
})

// vitest --typecheck runs the *.test-d.ts assertions.
const typecheckTests = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "--typecheck.only", "--config", "test/vitest.config.ts"],
  env: { SKIP_GLOBAL_SETUP: "true" },
  data: [src.srcs, src.tests, infra, vitestConfig],
})

// Type-level performance is a regression surface: @ark/attest snapshots
// type-instantiation counts per case into .attest, and a case that blows
// past its snapshot fails. Snapshots update with --write, like any
// Generate.
const typeBench = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "--config", "test/vitest.config.ts", "--project", "type-bench"],
  env: { TYPES: "true" },
  data: [src.srcs, src.tests, infra, vitestConfig],
})

const bench = S.Shell.Run({
  bin: S.NodeModule.Bin("vitest"),
  args: ["bench", "--config", "test/vitest.config.ts"],
  data: [src.srcs, src.tests, infra, vitestConfig],
  services: [anvilMainnet],
})

// Validates every chain definition against its live RPC, so it is a
// network target rather than part of the hermetic suites.
const testChains = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "test/scripts/chains.test.ts"],
  data: [src.srcs, infra],
  sandbox: { network: true },
})

export const Package = S.Package({
  targets: {
    anvilMainnet,
    anvilOptimism,
    anvilSepolia,
    anvilZksync,
    bench,
    infra,
    test,
    testChains,
    testNoMulticall,
    testTempo,
    testTempoDeployed,
    testTempoFuzz,
    testTempoFuzzNode,
    testTempoMultisig,
    testTempoNext,
    typeBench,
    typecheckTests,
  },
})
