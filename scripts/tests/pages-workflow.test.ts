// Tests for roadmap item 4b: .github/workflows/pages.yml (and ci.yml unchanged).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./miniyaml";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (f: string) => readFileSync(join(REPO, ".github/workflows", f), "utf8");

type Obj = Record<string, any>;
const wf = () => parseYaml(read("pages.yml")) as Obj;
const jobs = () => wf().jobs as Obj;
const deployEntry = () => {
  const j = jobs();
  const key = Object.keys(j).find((k) => k === "deploy") ?? Object.keys(j).find((k) => /deploy/i.test(k));
  expect(key, "a deploy job must exist").toBeDefined();
  return [key!, j[key!]] as [string, Obj];
};
const needsOf = (job: Obj): string[] => [job.needs].flat().filter(Boolean);
const buildEntry = () => {
  const [dk] = deployEntry();
  const k = Object.keys(jobs()).find((x) => x !== dk);
  expect(k, "a build job must exist").toBeDefined();
  return [k!, jobs()[k!]] as [string, Obj];
};
const cond = (job: Obj) => String(job.if ?? "").replace(/\s+/g, " ");
const allSteps = () => Object.values(jobs()).flatMap((j: any) => (j.steps ?? []) as Obj[]);

describe("pages.yml triggers (R4)", () => {
  it("triggers on pull_request, push to main, workflow_dispatch", () => {
    const on = wf().on as Obj;
    expect(Object.keys(on)).toEqual(expect.arrayContaining(["pull_request", "push", "workflow_dispatch"]));
    const branches = [on.push?.branches].flat();
    expect(branches).toEqual(["main"]);
  });
});

describe("pages.yml build job", () => {
  it("runs on every trigger (no restrictive if), installs frozen, builds free, assembles, uploads", () => {
    const [, b] = buildEntry();
    expect(cond(b)).toBe("");
    const text = JSON.stringify(b.steps);
    expect(text).toContain("pnpm install --frozen-lockfile");
    expect(text).toMatch(/pnpm --filter @net-picking\/free build/);
    expect(text).toMatch(/node scripts\/assemble-site\.mjs/);
    expect(text).toContain("actions/upload-pages-artifact");
  });

  it("assemble step runs after build and before upload", () => {
    const [, b] = buildEntry();
    const steps = JSON.stringify((b.steps as Obj[]).map((s) => s.run ?? s.uses));
    const i = (re: RegExp) => (b.steps as Obj[]).findIndex((s) => re.test(String(s.run ?? s.uses ?? "")));
    expect(i(/--filter @net-picking\/free build/)).toBeGreaterThan(-1);
    expect(i(/assemble-site/)).toBeGreaterThan(i(/--filter @net-picking\/free build/));
    expect(i(/upload-pages-artifact/)).toBeGreaterThan(i(/assemble-site/));
    expect(steps).toBeTruthy();
  });

  it("upload path matches the directory the assemble script writes to", () => {
    const [, b] = buildEntry();
    const asm = (b.steps as Obj[]).find((s) => /assemble-site/.test(String(s.run)))!;
    const up = (b.steps as Obj[]).find((s) => /upload-pages-artifact/.test(String(s.uses)))!;
    const outArg = String(asm.run).trim().split(/\s+/).pop()!.replace(/\/$/, "");
    expect(String(up.with?.path ?? "_site").replace(/^\.\//, "").replace(/\/$/, "")).toBe(outArg.replace(/^\.\//, ""));
  });

  it("does not reuse the CI job name test-and-build", () => {
    expect(Object.keys(jobs())).not.toContain("test-and-build");
    for (const j of Object.values(jobs()) as Obj[]) expect(j.name).not.toBe("test-and-build");
  });
});

describe("pages.yml deploy job", () => {
  it("needs the build job", () => {
    const [, d] = deployEntry();
    const [bk] = buildEntry();
    expect(needsOf(d)).toContain(bk);
  });

  it("if requires the main ref and a push/workflow_dispatch event, and never allows pull_request", () => {
    const [, d] = deployEntry();
    const c = cond(d);
    expect(c).not.toBe("");
    expect(c).toMatch(/github\.ref\s*==\s*'refs\/heads\/main'/);
    expect(c).toMatch(/github\.event_name\s*==\s*'push'/);
    expect(c).toMatch(/github\.event_name\s*==\s*'workflow_dispatch'/);
    expect(c).not.toMatch(/pull_request/);
    expect(c).not.toMatch(/!=/);
    // ref check must be ANDed at top level, not ORed with the event check
    expect(c).toMatch(/&&/);
    const stripped = c.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
    expect(stripped).toMatch(/^\(.*(push|workflow_dispatch).*\)\s*&&\s*github\.ref|github\.ref\s*==\s*'refs\/heads\/main'\s*&&\s*\(/);
  });

  it("uses actions/deploy-pages and environment github-pages", () => {
    const [, d] = deployEntry();
    expect(JSON.stringify(d.steps)).toContain("actions/deploy-pages");
    const env = typeof d.environment === "string" ? d.environment : d.environment?.name;
    expect(env).toBe("github-pages");
  });
});

describe("pages.yml permissions, concurrency, supply chain", () => {
  it("top-level permissions are exactly contents: read", () => {
    expect(wf().permissions).toEqual({ contents: "read" });
  });

  it("deploy job has pages: write and id-token: write", () => {
    const [, d] = deployEntry();
    expect(d.permissions?.pages).toBe("write");
    expect(d.permissions?.["id-token"]).toBe("write");
  });

  it("no non-deploy job has any write permission", () => {
    const [dk] = deployEntry();
    for (const [k, j] of Object.entries(jobs()) as [string, Obj][]) {
      if (k === dk) continue;
      const p = j.permissions;
      expect(p === "write-all" || p === "write", k).toBe(false);
      if (p && typeof p === "object") for (const v of Object.values(p)) expect(v, k).not.toBe("write");
    }
  });

  it("pages: write / id-token: write appear nowhere outside the deploy job", () => {
    const text = read("pages.yml").split("\n");
    const w = parseYaml(read("pages.yml")) as Obj;
    const [dk] = deployEntry();
    const { [dk]: _d, ...rest } = w.jobs as Obj;
    const outside = JSON.stringify({ ...w, jobs: rest });
    expect(outside).not.toMatch(/"(pages|id-token)":"write"/);
    expect(text.length).toBeGreaterThan(0);
  });

  it("concurrency group pages, cancel-in-progress false, on the deploy job only", () => {
    const [, d] = deployEntry();
    expect(d.concurrency?.group).toBe("pages");
    expect(d.concurrency?.["cancel-in-progress"]).toBe(false);
    expect(wf().concurrency).toBeUndefined();
    const [, b] = buildEntry();
    expect(b.concurrency).toBeUndefined();
  });

  it("uses no secrets", () => {
    expect(read("pages.yml")).not.toMatch(/secrets\./);
  });

  it("only actions/* and pnpm/action-setup actions are used", () => {
    const uses = allSteps().map((s) => s.uses).filter(Boolean) as string[];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/^(actions\/[\w.-]+|pnpm\/action-setup)(@.+)?$/);
    // also catch any `uses:` text, including job-level reusable workflows
    for (const m of read("pages.yml").matchAll(/^\s*-?\s*uses:\s*(\S+)/gm))
      expect(m[1], m[1]).toMatch(/^(actions\/[\w.-]+|pnpm\/action-setup)(@.+)?$/);
  });
});

describe("ci.yml unchanged (R5)", () => {
  it("still has job test-and-build", () => {
    const ci = parseYaml(read("ci.yml")) as Obj;
    expect(Object.keys(ci.jobs)).toEqual(["test-and-build"]);
    expect(ci.permissions).toEqual({ contents: "read" });
  });
});
